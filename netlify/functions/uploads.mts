import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Serves catalog images uploaded from the admin dashboard.
export default async (_req: Request, context: Context) => {
  const key = context.params.key;
  if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(key)) return new Response("Not found", { status: 404 });
  const result = await getStore("catalog-images").getWithMetadata(key, { type: "arrayBuffer" });
  if (!result) return new Response("Not found", { status: 404 });
  return new Response(result.data, {
    headers: {
      "Content-Type": String(result.metadata.contentType || "application/octet-stream"),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

export const config: Config = {
  path: "/uploads/:key",
};
