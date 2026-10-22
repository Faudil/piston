CREATE TABLE "resume_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_profiles" ADD CONSTRAINT "resume_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resume_profiles_user_name" ON "resume_profiles" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_profiles_one_default_per_user" ON "resume_profiles" USING btree ("user_id") WHERE "resume_profiles"."is_default";--> statement-breakpoint
-- Hand-written data migration: every user who already has resumes gets a
-- default « Principal » profile holding all of them. Users without resumes get
-- none; the app creates « Principal » lazily with their first resume.
INSERT INTO "resume_profiles" ("user_id", "name", "is_default")
SELECT DISTINCT "user_id", 'Principal', true FROM "resumes";--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
UPDATE "resumes" SET "profile_id" = "resume_profiles"."id"
FROM "resume_profiles"
WHERE "resume_profiles"."user_id" = "resumes"."user_id" AND "resume_profiles"."is_default";--> statement-breakpoint
ALTER TABLE "resumes" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_profile_id_resume_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."resume_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- At most one current resume per user, so at most one per « Principal »
-- profile: the new index cannot fail on existing data.
DROP INDEX "resumes_one_current_per_user";--> statement-breakpoint
CREATE UNIQUE INDEX "resumes_one_current_per_profile" ON "resumes" USING btree ("profile_id") WHERE "resumes"."is_current";--> statement-breakpoint
-- Earlier generations name their resume only: record its profile too, so
-- per-profile lists (latest review, saved leads) include them.
UPDATE "generations" SET "input_refs" = "generations"."input_refs" || jsonb_build_object('profileId', "resumes"."profile_id")
FROM "resumes"
WHERE "generations"."input_refs"->>'resumeId' = "resumes"."id"::text AND NOT ("generations"."input_refs" ? 'profileId');--> statement-breakpoint
-- Existing offers keep a null profile, i.e. they use the default profile.
ALTER TABLE "job_offers" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_profile_id_resume_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."resume_profiles"("id") ON DELETE set null ON UPDATE no action;
