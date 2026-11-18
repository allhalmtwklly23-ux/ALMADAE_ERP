CREATE FUNCTION public.erp_team_conversations(p_company_id UUID, p_user_id TEXT)
RETURNS TABLE (
  contact_id TEXT, contact_name TEXT, last_body TEXT, last_at TIMESTAMPTZ,
  last_sender_id TEXT, unread_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH visible AS (
    SELECT m.*,
      CASE WHEN m.sender_id = p_user_id THEN m.recipient_id ELSE m.sender_id END AS other_id,
      CASE WHEN m.sender_id = p_user_id THEN m.recipient_name ELSE m.sender_name END AS other_name
    FROM public.erp_team_messages m
    WHERE m.company_id = p_company_id AND (m.sender_id = p_user_id OR m.recipient_id = p_user_id)
      AND EXISTS (
        SELECT 1 FROM public.erp_company_memberships cm JOIN public.erp_users u ON u.id = cm.user_id
        WHERE cm.company_id = p_company_id AND cm.user_id = p_user_id AND cm.is_active AND u.active
      )
  ), ranked AS (
    SELECT visible.*,
      row_number() OVER (PARTITION BY other_id ORDER BY created_at DESC, id DESC) AS position,
      count(*) FILTER (WHERE recipient_id = p_user_id AND read_at IS NULL)
        OVER (PARTITION BY other_id) AS unread
    FROM visible
  )
  SELECT other_id, other_name, body, created_at, sender_id, unread
    FROM ranked WHERE position = 1 ORDER BY created_at DESC, id DESC;
$$;

CREATE FUNCTION public.erp_team_conversation_messages(
  p_company_id UUID, p_user_id TEXT, p_contact_id TEXT,
  p_before_created_at TIMESTAMPTZ DEFAULT NULL, p_before_id UUID DEFAULT NULL
)
RETURNS SETOF public.erp_team_messages
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.* FROM public.erp_team_messages m
  WHERE m.company_id = p_company_id
    AND ((m.sender_id = p_user_id AND m.recipient_id = p_contact_id)
      OR (m.recipient_id = p_user_id AND m.sender_id = p_contact_id))
    AND ((p_before_created_at IS NULL AND p_before_id IS NULL)
      OR (p_before_created_at IS NOT NULL AND p_before_id IS NOT NULL
        AND (m.created_at, m.id) < (p_before_created_at, p_before_id)))
    AND EXISTS (
      SELECT 1 FROM public.erp_company_memberships cm JOIN public.erp_users u ON u.id = cm.user_id
      WHERE cm.company_id = p_company_id AND cm.user_id = p_user_id AND cm.is_active AND u.active
    )
  ORDER BY m.created_at DESC, m.id DESC LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.erp_team_conversations(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_team_conversation_messages(UUID, TEXT, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_team_conversations(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_team_conversation_messages(UUID, TEXT, TEXT, TIMESTAMPTZ, UUID) TO service_role;
