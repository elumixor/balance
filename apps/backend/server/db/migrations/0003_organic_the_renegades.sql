CREATE TABLE "planned_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"time_zone" text NOT NULL,
	"ahead" boolean NOT NULL,
	"rest" boolean DEFAULT false NOT NULL,
	"coverage_percent" integer DEFAULT 0 NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"time_zone" text NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_copy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"slot" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planned_days" ADD CONSTRAINT "planned_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_weeks" ADD CONSTRAINT "planned_weeks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_copy" ADD CONSTRAINT "session_copy_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_ledger" ADD CONSTRAINT "star_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "planned_days_one_per_day" ON "planned_days" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "planned_weeks_one_per_week" ON "planned_weeks" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "session_copy_one_per_slot" ON "session_copy" USING btree ("user_id","day","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "star_ledger_one_per_reason" ON "star_ledger" USING btree ("user_id","day","reason");