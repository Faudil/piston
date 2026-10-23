CREATE TABLE "cv_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cv_share_links" ADD CONSTRAINT "cv_share_links_document_id_cv_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."cv_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_share_links" ADD CONSTRAINT "cv_share_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cv_share_links_token_unique" ON "cv_share_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "cv_share_links_document_idx" ON "cv_share_links" USING btree ("document_id");