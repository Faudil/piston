ALTER TYPE "public"."generation_kind" ADD VALUE 'cv_draft';--> statement-breakpoint
ALTER TYPE "public"."generation_kind" ADD VALUE 'cv_edit';--> statement-breakpoint
CREATE TABLE "cv_document_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"source" text NOT NULL,
	"generation_id" uuid,
	"template_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"design" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"offer_id" uuid,
	"title" text NOT NULL,
	"template_id" text DEFAULT 'sobre' NOT NULL,
	"content" jsonb NOT NULL,
	"design" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cv_document_revisions" ADD CONSTRAINT "cv_document_revisions_document_id_cv_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."cv_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_document_revisions" ADD CONSTRAINT "cv_document_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_document_revisions" ADD CONSTRAINT "cv_document_revisions_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD CONSTRAINT "cv_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD CONSTRAINT "cv_documents_profile_id_resume_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."resume_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD CONSTRAINT "cv_documents_offer_id_job_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."job_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_document_revisions_document_idx" ON "cv_document_revisions" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "cv_documents_user_idx" ON "cv_documents" USING btree ("user_id","profile_id");