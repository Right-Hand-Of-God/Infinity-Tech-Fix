import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const catalogItems = pgTable("catalog_items", {
  id: serial().primaryKey(),
  category: text().notNull(),
  title: text().notNull(),
  description: text().notNull().default(""),
  price: text().notNull().default(""),
  model: text().notNull().default(""),
  partCategory: text("part_category").notNull().default("Accessories"),
  target: text().notNull().default("phones"),
  stock: text().notNull().default(""),
  image: text().notNull().default(""),
  visible: boolean().notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
