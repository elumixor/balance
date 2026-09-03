CREATE TABLE "integration_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"calendar_id" text NOT NULL,
	"external_event_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_records" ADD CONSTRAINT "integration_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_records_unique" ON "integration_records" USING btree ("user_id","source","provider","calendar_id","external_event_id");