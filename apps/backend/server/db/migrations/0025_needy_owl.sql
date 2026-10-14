CREATE TABLE "event_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"calendar_id" text NOT NULL,
	"scope" text NOT NULL,
	"external_event_id" text NOT NULL,
	"category_id" uuid,
	"project_id" uuid,
	"probability" real,
	"confidence" real,
	"filed" boolean DEFAULT false NOT NULL,
	"model" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_classifications" ADD CONSTRAINT "event_classifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_classifications" ADD CONSTRAINT "event_classifications_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_classifications" ADD CONSTRAINT "event_classifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_classifications_unique" ON "event_classifications" USING btree ("user_id","provider","calendar_id","scope","external_event_id");