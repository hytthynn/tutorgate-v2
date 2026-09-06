-- TG-009: enum values must commit BEFORE their first use (PostgreSQL).
-- Kept in a separate migration so Supabase's transaction runner is safe.
alter type public.application_status add value if not exists 'pending_review';
alter type public.application_status add value if not exists 'approved';
alter type public.application_status add value if not exists 'rejected';
