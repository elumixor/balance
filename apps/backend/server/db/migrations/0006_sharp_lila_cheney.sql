ALTER TABLE "event_mappings" ADD COLUMN "timer" jsonb;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD COLUMN "owns_event" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD COLUMN "from_event" boolean DEFAULT false NOT NULL;