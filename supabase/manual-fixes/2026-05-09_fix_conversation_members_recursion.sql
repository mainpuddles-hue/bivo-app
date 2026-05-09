BEGIN;

-- Helper: bypass RLS within the policy itself
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = conv_id AND user_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;

-- Replace recursive policy with the helper
DROP POLICY "Members view group members" ON public.conversation_members;

CREATE POLICY "Members view group members"
  ON public.conversation_members
  FOR SELECT
  TO authenticated
  USING (public.is_conversation_member(conversation_id));

COMMIT;
