CREATE TABLE "catalog_items" (
	"id" serial PRIMARY KEY,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"part_category" text DEFAULT 'Accessories' NOT NULL,
	"target" text DEFAULT 'phones' NOT NULL,
	"stock" text DEFAULT '' NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
