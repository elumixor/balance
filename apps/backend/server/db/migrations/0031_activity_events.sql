CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"place" jsonb,
	"sphere_id" uuid,
	"attribution" text,
	"confidence" real DEFAULT 1 NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_sphere_id_categories_id_fk" FOREIGN KEY ("sphere_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_events_unique" ON "activity_events" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "activity_events_user_start" ON "activity_events" USING btree ("user_id","start_at");