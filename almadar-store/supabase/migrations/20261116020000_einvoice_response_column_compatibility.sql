DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'erp_einvoice_documents'
       AND column_name = 'last_response'
  ) AND NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'erp_einvoice_documents'
       AND column_name = 'last_response_summary'
  ) THEN
    ALTER TABLE public.erp_einvoice_documents
      RENAME COLUMN last_response TO last_response_summary;
  END IF;
END;
$$;
