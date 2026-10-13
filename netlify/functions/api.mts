import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { desc, eq } from "drizzle-orm";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "../../db/index.js";
import { catalogItems } from "../../db/schema.js";

const SESSION_COOKIE = "itech_admin_session";
const SESSION_LIFETIME = 12 * 60 * 60;
// Synchronous functions accept request bodies up to 6 MB, so uploads are capped below that.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const ALLOWED_CATEGORIES = new Set([
  "home-showcase", "phone-sales", "phone-repairs", "laptop-sales", "laptop-repairs", "gadgets", "phone-parts",
]);
const ALLOWED_PART_CATEGORIES = new Set([
  "Displays", "Batteries", "Charging ports", "Cameras", "Flex cables", "Motherboards & ICs", "Audio", "Tools", "Accessories",
]);
const ALLOWED_TARGETS = new Set(["phones", "repairs", "laptops", "gadgets"]);
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

type Item = typeof catalogItems.$inferSelect;

function publicItem(item: Item) {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    description: item.description,
    price: item.price,
    model: item.model,
    part_category: item.partCategory,
    target: item.target,
    stock: item.stock,
    image: item.image,
    visible: item.visible,
  };
}

function json(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function adminPassword() {
  return Netlify.env.get("ITECH_ADMIN_PASSWORD") || "";
}

function sessionSecret() {
  const configured = Netlify.env.get("ITECH_SESSION_SECRET");
  if (configured && configured.length >= 32) return configured;
  // Derived from the password so changing the password also signs everyone out.
  return createHash("sha256").update(`itech-session:${adminPassword()}`).digest("hex");
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAuthenticated(context: Context) {
  if (!adminPassword()) return false;
  const token = context.cookies.get(SESSION_COOKIE);
  if (!token) return false;
  const [expires, nonce, signature] = token.split(".");
  if (!expires || !nonce || !signature) return false;
  if (!safeEqual(signature, sign(`${expires}.${nonce}`))) return false;
  return Number(expires) > Date.now() / 1000;
}

function setSession(context: Context) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_LIFETIME;
  const nonce = randomBytes(16).toString("base64url");
  context.cookies.set({
    name: SESSION_COOKIE,
    value: `${expires}.${nonce}.${sign(`${expires}.${nonce}`)}`,
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    expires: new Date(expires * 1000),
  });
}

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

async function login(req: Request, context: Context) {
  const expected = adminPassword();
  if (!expected) {
    return json({ error: "The admin password has not been configured for this site yet." }, 503);
  }
  const data = await req.json().catch(() => null);
  const password = typeof data?.password === "string" ? data.password : "";
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  if (!password || !safeEqual(digest(password), digest(expected))) {
    return json({ error: "Incorrect password." }, 401);
  }
  setSession(context);
  return json({ ok: true, role: "owner" });
}

function validateItem(data: any): { error: string } | { values: Omit<Item, "id" | "createdAt"> } {
  if (!data || typeof data !== "object") return { error: "Send the listing as JSON." };
  const {
    category = "", title = "", description = "", price = "", model = "",
    part_category = "Accessories", target = "phones", stock = "", image = "", visible = true,
  } = data;
  if (!ALLOWED_CATEGORIES.has(category)) return { error: "Choose a valid catalog section." };
  if (!ALLOWED_PART_CATEGORIES.has(part_category)) return { error: "Choose a valid spare-part category." };
  if (!ALLOWED_TARGETS.has(target)) return { error: "Choose a valid storefront destination." };
  if (typeof title !== "string" || !title.trim() || title.length > 120) {
    return { error: "Title is required and must be 120 characters or fewer." };
  }
  const limits: [string, unknown, number][] = [
    ["Description", description, 2000],
    ["Price", price, 80],
    ["Model", model, 120],
    ["Stock", stock, 80],
    ["Image", image, 250],
  ];
  for (const [name, value, limit] of limits) {
    if (typeof value !== "string" || value.length > limit) return { error: `${name} is invalid or too long.` };
  }
  if (category === "phone-parts") {
    const numeric = Number(String(price).replace(/[,₦\s]/g, ""));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return { error: "Spare-part listings need a numeric price greater than zero." };
    }
  }
  if (image && !/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(image) && !/^[^/\\]+\.(jpe?g|png|webp|gif)$/i.test(image)) {
    return { error: "Select an existing storefront image or upload a new one." };
  }
  if (typeof visible !== "boolean") return { error: "Visibility must be true or false." };
  return {
    values: {
      category,
      title: title.trim(),
      description: description.trim(),
      price: price.trim(),
      model: model.trim(),
      partCategory: part_category,
      target,
      stock: stock.trim(),
      image,
      visible,
    },
  };
}

async function uploadImage(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!file || typeof file === "string") return json({ error: "Choose an image file to upload." }, 400);
  const extension = ALLOWED_IMAGE_TYPES[file.type.toLowerCase()];
  if (!extension || !file.size || file.size > MAX_IMAGE_BYTES) {
    return json({ error: "Use a JPEG, PNG, WEBP, or GIF image under 4 MB." }, 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const signatures: Record<string, boolean> = {
    "image/jpeg": starts(0xff, 0xd8, 0xff),
    "image/png": starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    "image/webp": ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP",
    "image/gif": ["GIF87a", "GIF89a"].includes(ascii(0, 6)),
  };
  if (!signatures[file.type.toLowerCase()]) {
    return json({ error: "Image contents do not match the selected image format." }, 400);
  }
  const key = randomBytes(16).toString("hex") + extension;
  await getStore({ name: "catalog-images", consistency: "strong" }).set(key, bytes.buffer as ArrayBuffer, {
    metadata: { contentType: file.type.toLowerCase() },
  });
  return json({ image: `/uploads/${key}` }, 201);
}

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const method = req.method;

  try {
    if (method === "GET" && path === "/api/status") {
      const authenticated = isAuthenticated(context);
      return json({
        setup_required: !adminPassword(),
        authenticated,
        role: authenticated ? "owner" : null,
      });
    }

    if (method === "GET" && path === "/api/items") {
      const rows = await db.select().from(catalogItems).where(eq(catalogItems.visible, true)).orderBy(desc(catalogItems.id));
      return json(rows.map(publicItem));
    }

    if (method !== "GET" && !sameOrigin(req)) {
      return json({ error: "Request origin is not allowed." }, 403);
    }

    if (method === "POST" && path === "/api/login") return login(req, context);

    if (method === "POST" && path === "/api/logout") {
      context.cookies.delete({ name: SESSION_COOKIE, path: "/" });
      return json({ ok: true });
    }

    if (!isAuthenticated(context)) {
      return json({ error: "Sign in to manage the catalog." }, 401);
    }

    if (method === "GET" && path === "/api/admin/items") {
      const rows = await db.select().from(catalogItems).orderBy(desc(catalogItems.id));
      return json(rows.map(publicItem));
    }

    if (method === "POST" && path === "/api/upload") return uploadImage(req);

    if (method === "POST" && path === "/api/items") {
      const result = validateItem(await req.json().catch(() => null));
      if ("error" in result) return json(result, 400);
      const [item] = await db.insert(catalogItems).values(result.values).returning();
      return json(publicItem(item), 201);
    }

    const match = path.match(/^\/api\/items\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      if (method === "PUT") {
        const result = validateItem(await req.json().catch(() => null));
        if ("error" in result) return json(result, 400);
        const [item] = await db.update(catalogItems).set(result.values).where(eq(catalogItems.id, id)).returning();
        if (!item) return json({ error: "Listing not found." }, 404);
        return json(publicItem(item));
      }
      if (method === "DELETE") {
        const [item] = await db.delete(catalogItems).where(eq(catalogItems.id, id)).returning();
        if (!item) return json({ error: "Listing not found." }, 404);
        return json({ ok: true });
      }
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Catalog API error:", error);
    return json({ error: "The catalog service hit an unexpected error. Try again." }, 500);
  }
};

export const config: Config = {
  path: "/api/*",
};
