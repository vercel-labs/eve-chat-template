CREATE TABLE "projection" (
	"projection_hash" text PRIMARY KEY NOT NULL,
	"parent_projection_hashes" jsonb NOT NULL,
	"ladder_level" integer DEFAULT 0 NOT NULL,
	"goal" text,
	"op" text NOT NULL,
	"scope" jsonb,
	"loss_accounting" jsonb,
	"body" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_projection_created_at" ON "projection" USING btree ("created_at");