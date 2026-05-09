-- Lock down waitlist SELECT so anon and authenticated cannot enumerate
-- the full waitlist of email addresses + GPS coordinates.
--
-- The previous policy `select_waitlist USING (true)` let any client run
--   SELECT email, detected_lat, detected_lng FROM waitlist
-- and dump every signup. That's a GDPR Article 32 failure (uncontrolled
-- access to personal data) and a competitive risk (anyone could scrape
-- our pre-launch interest list).
--
-- Insert stays open by design: the marketing site form is anon and
-- needs to write rows. Reads now require service_role, which is only
-- available to Edge Functions and the admin dashboard server.
--
-- Note: waitlist signups before this fix may have been read by an
-- unknown number of clients. Treat the existing rows as already
-- exposed and assume the email list is in the wild.

DROP POLICY IF EXISTS "select_waitlist" ON public.waitlist;

-- Belt-and-braces: leave INSERT open for anon, but keep SELECT/UPDATE/
-- DELETE service-only by NOT defining policies for them. With RLS
-- enabled and no SELECT policy, anon and authenticated get an empty
-- result set on SELECT — which is what we want.
