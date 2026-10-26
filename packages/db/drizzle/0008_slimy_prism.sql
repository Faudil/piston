CREATE TYPE "public"."api_provider" AS ENUM('anthropic', 'tavily');--> statement-breakpoint
CREATE TYPE "public"."usage_status" AS ENUM('reserved', 'done', 'failed', 'aborted');--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"provider" "api_provider" NOT NULL,
	"operation" text NOT NULL,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"credits" double precision DEFAULT 0 NOT NULL,
	"estimated_cost_micros" integer DEFAULT 0 NOT NULL,
	"status" "usage_status" DEFAULT 'reserved' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_usage_provider_created_idx" ON "api_usage" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "api_usage_user_provider_created_idx" ON "api_usage" USING btree ("user_id","provider","created_at");