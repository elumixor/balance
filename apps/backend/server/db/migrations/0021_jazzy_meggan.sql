ALTER TABLE "notion_connections" DROP CONSTRAINT "notion_connections_pkey";--> statement-breakpoint
ALTER TABLE "notion_connections" ALTER COLUMN "mapping" SET DEFAULT '{"description":null}'::jsonb;--> statement-breakpoint
ALTER TABLE "notion_connections" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "notion_connections" ADD COLUMN "workspace_icon" text;--> statement-breakpoint
ALTER TABLE "notion_connections" ADD COLUMN "account_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notion_connections" ADD COLUMN "account_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notion_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notion_tasks_name" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notion_task_mapping" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_notion_connection_id_notion_connections_id_fk" FOREIGN KEY ("notion_connection_id") REFERENCES "public"."notion_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notion_connections_workspace_per_user" ON "notion_connections" USING btree ("user_id","workspace_id");--> statement-breakpoint
UPDATE "projects" SET "notion_connection_id" = (SELECT "id" FROM "notion_connections" WHERE "notion_connections"."user_id" = "projects"."user_id" LIMIT 1) WHERE "notion_page_id" IS NOT NULL OR "notion_tasks_data_source_id" IS NOT NULL;