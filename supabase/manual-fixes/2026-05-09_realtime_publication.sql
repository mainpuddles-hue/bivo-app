-- The supabase_realtime publication is empty, so every .on('postgres_changes')
-- subscription in the app fails with CHANNEL_ERROR. Add the four core tables
-- the app subscribes to.
-- Risk: zero data risk, fully reversible. Only enables logical replication for
-- these tables to the Realtime broadcast layer.

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.messages,
  public.conversations,
  public.conversation_members,
  public.notifications;
