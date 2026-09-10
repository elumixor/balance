ALTER TABLE "notion_connections" ADD COLUMN "refresh_token" text;--> statement-breakpoint
ALTER TABLE "notion_connections" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notion_connections" ADD COLUMN "projects_data_source_id" text;--> statement-breakpoint
ALTER TABLE "notion_connections" ADD COLUMN "workspace_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notion_connections" DROP COLUMN "projects_database_id";