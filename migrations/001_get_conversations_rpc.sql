CREATE OR REPLACE FUNCTION get_conversations_with_details(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  user1_id uuid,
  user2_id uuid,
  post_id uuid,
  user1_archived boolean,
  user2_archived boolean,
  created_at timestamptz,
  updated_at timestamptz,
  other_user_id uuid,
  other_user_name text,
  other_user_avatar text,
  other_user_last_active text,
  last_message_id uuid,
  last_message_content text,
  last_message_sender_id uuid,
  last_message_image_url text,
  last_message_created_at timestamptz,
  last_message_is_read boolean,
  unread_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
AS $func$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.user1_id, c.user2_id, c.post_id,
    c.user1_archived, c.user2_archived,
    c.created_at, c.updated_at,
    CASE WHEN c.user1_id = p_user_id THEN c.user2_id ELSE c.user1_id END AS other_user_id,
    p.name AS other_user_name,
    p.avatar_url AS other_user_avatar,
    p.last_active_date::text AS other_user_last_active,
    lm.id AS last_message_id,
    lm.content AS last_message_content,
    lm.sender_id AS last_message_sender_id,
    lm.image_url AS last_message_image_url,
    lm.created_at AS last_message_created_at,
    lm.is_read AS last_message_is_read,
    (SELECT count(*) FROM messages m
     WHERE m.conversation_id = c.id
     AND m.sender_id != p_user_id
     AND m.is_read = false) AS unread_count
  FROM conversations c
  JOIN profiles p ON p.id = CASE WHEN c.user1_id = p_user_id THEN c.user2_id ELSE c.user1_id END
  LEFT JOIN LATERAL (
    SELECT m.id, m.content, m.sender_id, m.image_url, m.created_at, m.is_read
    FROM messages m WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE c.user1_id = p_user_id OR c.user2_id = p_user_id
  ORDER BY c.updated_at DESC
  LIMIT 50;
END;
$func$;
