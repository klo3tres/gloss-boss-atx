-- Production completion pass: repair common mojibake in opportunity titles.
-- Prefer existing notes columns; no new tables.
-- Safe replace of UTF-8 mis-decoded em dash (â€”) → —

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'titan_opportunities'
  ) THEN
    UPDATE public.titan_opportunities
    SET title = replace(title, 'â€”', '—')
    WHERE title LIKE '%â€”%';

    UPDATE public.titan_opportunities
    SET title = replace(title, 'â€“', '–')
    WHERE title LIKE '%â€“%';

    UPDATE public.titan_opportunities
    SET title = replace(title, 'â†’', '→')
    WHERE title LIKE '%â†’%';

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'titan_opportunities' AND column_name = 'notes'
    ) THEN
      EXECUTE $q$
        UPDATE public.titan_opportunities
        SET notes = replace(notes, 'â€”', '—')
        WHERE notes LIKE '%â€”%'
      $q$;
    END IF;
  END IF;
END $$;
