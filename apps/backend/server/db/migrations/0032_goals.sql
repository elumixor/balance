CREATE TABLE "goal_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"metrics" jsonb NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"metric" text NOT NULL,
	"aggregate" text DEFAULT 'sum' NOT NULL,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"time_zone" text NOT NULL,
	"levels" jsonb NOT NULL,
	"advance_after" integer DEFAULT 3 NOT NULL,
	"ease_after" integer DEFAULT 2 NOT NULL,
	"starts_on" text NOT NULL,
	"sphere_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_tokens" ADD CONSTRAINT "goal_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_sphere_id_categories_id_fk" FOREIGN KEY ("sphere_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_progress_unique" ON "goal_progress" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "goal_progress_goal_at" ON "goal_progress" USING btree ("goal_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_user_key" ON "goals" USING btree ("user_id","key");