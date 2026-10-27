ALTER TABLE "event_classifications" DROP CONSTRAINT "event_classifications_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "event_mappings" DROP CONSTRAINT "event_mappings_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "event_mappings" DROP CONSTRAINT "event_mappings_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "event_classifications" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "event_mappings" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "event_mappings" DROP COLUMN "task_id";--> statement-breakpoint
ALTER TABLE "event_mappings" ADD COLUMN "urn" text;--> statement-breakpoint
ALTER TABLE "people" DROP COLUMN "notion_page_id";--> statement-breakpoint
DROP TABLE "tasks" CASCADE;--> statement-breakpoint
DROP TABLE "stages" CASCADE;--> statement-breakpoint
DROP TABLE "projects" CASCADE;--> statement-breakpoint
DROP TABLE "notion_connections" CASCADE;