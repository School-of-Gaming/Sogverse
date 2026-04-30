-- Allow anonymous parents (browsing the public products-v2 catalog) to read
-- the locations reference table — the browse cards and detail page render
-- "Tapiolan koulu, Espoo" beside in-person products, and that read happens
-- before sign-in.
--
-- Only the location *names* (and parent chain) become public here.
-- site_details_v2 (address, access notes) and site_staff_details_v2 (gate
-- codes, etc.) keep their existing policies — see migration 00030.

CREATE POLICY "anon_read_locations"
  ON locations FOR SELECT TO anon
  USING (true);

GRANT SELECT ON locations TO anon;
