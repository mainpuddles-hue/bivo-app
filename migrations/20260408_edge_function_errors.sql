-- Edge Function error logging table (Sentry alternative)
CREATE TABLE IF NOT EXISTS edge_function_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE edge_function_errors ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write
CREATE POLICY "service_role_ef_errors" ON edge_function_errors
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-cleanup: keep 30 days of error logs
CREATE OR REPLACE FUNCTION cleanup_old_ef_errors()
RETURNS void AS $$
BEGIN
  DELETE FROM edge_function_errors WHERE created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Run cleanup weekly on Sundays at 4 AM
SELECT cron.schedule('cleanup-ef-errors', '0 4 * * 0', 'SELECT cleanup_old_ef_errors()');
