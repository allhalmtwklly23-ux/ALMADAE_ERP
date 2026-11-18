CREATE TABLE public.erp_team_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX erp_team_messages_sender_idx ON public.erp_team_messages (company_id, sender_id, created_at DESC);
CREATE INDEX erp_team_messages_recipient_idx ON public.erp_team_messages (company_id, recipient_id, created_at DESC);
CREATE INDEX erp_team_messages_unread_idx ON public.erp_team_messages (company_id, recipient_id) WHERE read_at IS NULL;
CREATE INDEX erp_team_messages_company_idx ON public.erp_team_messages (company_id, created_at DESC);

ALTER TABLE public.erp_team_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_team_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.erp_team_messages TO service_role;

CREATE FUNCTION public.erp_send_team_message(
  p_company_id UUID, p_sender_id TEXT, p_recipient_id TEXT, p_body TEXT
)
RETURNS SETOF public.erp_team_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  sender_name TEXT;
  recipient_name TEXT;
BEGIN
  IF p_sender_id = p_recipient_id OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Invalid message';
  END IF;
  SELECT u.full_name INTO sender_name
    FROM public.erp_company_memberships m JOIN public.erp_users u ON u.id = m.user_id
    WHERE m.company_id = p_company_id AND m.user_id = p_sender_id AND m.is_active AND u.active
    FOR SHARE OF m, u;
  IF sender_name IS NULL THEN RAISE EXCEPTION 'sender_unavailable'; END IF;
  SELECT u.full_name INTO recipient_name
    FROM public.erp_company_memberships m JOIN public.erp_users u ON u.id = m.user_id
    WHERE m.company_id = p_company_id AND m.user_id = p_recipient_id AND m.is_active AND u.active
    FOR SHARE OF m, u;
  IF recipient_name IS NULL THEN RAISE EXCEPTION 'recipient_unavailable'; END IF;
  RETURN QUERY INSERT INTO public.erp_team_messages
    (company_id, sender_id, sender_name, recipient_id, recipient_name, body)
    VALUES (p_company_id, p_sender_id, sender_name, p_recipient_id, recipient_name, btrim(p_body))
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_send_team_message(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_send_team_message(UUID, TEXT, TEXT, TEXT) TO service_role;
