CREATE TABLE "project_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"a_id" uuid NOT NULL,
	"b_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"winner_id" uuid NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_comparisons" ADD CONSTRAINT "project_comparisons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comparisons" ADD CONSTRAINT "project_comparisons_a_id_projects_id_fk" FOREIGN KEY ("a_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comparisons" ADD CONSTRAINT "project_comparisons_b_id_projects_id_fk" FOREIGN KEY ("b_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comparisons" ADD CONSTRAINT "project_comparisons_winner_id_projects_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;