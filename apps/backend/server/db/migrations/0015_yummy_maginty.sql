CREATE TABLE "notion_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"projects_database_id" text NOT NULL,
	"workspace_name" text DEFAULT '' NOT NULL,
	"needs_reconnect" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"color" text DEFAULT '#8b8b8b' NOT NULL,
	"notion_page_id" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS "gate_events" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "goals" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "project_comparisons" CASCADE;--> statement-breakpoint
ALTER TABLE "practices" DROP CONSTRAINT IF EXISTS "practices_goal_id_goals_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_goal_id_goals_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_stage_id_stages_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "stage_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "member_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ordinal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notion_page_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notion_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notion_tasks_data_source_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notion_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "project_id" uuid;--> statement-breakpoint
UPDATE "tasks" SET "project_id" = "stages"."project_id" FROM "stages" WHERE "tasks"."stage_id" = "stages"."id";--> statement-breakpoint
DELETE FROM "tasks" WHERE "project_id" IS NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
UPDATE "projects" SET "status" = CASE "status" WHEN 'held' THEN 'paused' WHEN 'parked' THEN 'paused' WHEN 'shipped' THEN 'done' WHEN 'killed' THEN 'dropped' ELSE 'active' END;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status" text DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assignee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "notion_page_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "notion_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "notion_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notion_connections" ADD CONSTRAINT "notion_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_id_projects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practices" DROP COLUMN "goal_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "goal_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "template";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "cover";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "links";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "people";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "deadline";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "unpark_trigger";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "sentence";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "metric";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "threshold";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "window_days";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "budget_hours";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "started_on";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "decide_on";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "extended_on";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "extension_note";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "outcome";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "decided_on";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "decision_note";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "checkpoints";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "done";