-- Five values join product_topic, and one of them changes what the enum means.
--
-- Until now every topic named a specific game or its authoring tool, and the
-- app leaned on that: labels are brand proper nouns held as literals in code,
-- and the product page's "About X" card explains a piece of software a parent
-- has to obtain. Rocket League is more of the same and fits that mould exactly.
--
-- Creator Studio, Programming, AI and Esports do not. They name *subject
-- matter* — what a group works on, not what it launches — so there is no single
-- title to rate, buy or link, and the software varies with whatever project the
-- group picks. Those four therefore carry no info block in
-- src/lib/products/topics.ts and render no About card; the practical "no paid
-- purchases, the Game Educator names the software in advance" note is written
-- per product into its own description instead, where it can say what that
-- product actually does.
--
-- Two consequences worth stating, because both are load-bearing elsewhere:
--
--   - Four of the five are common nouns, not brands, which is the first time
--     that has been true. Whether their labels get translated is an open
--     product decision (topics.ts describes the `labelKey` variant it would
--     use); until it is taken they render as English literals like every other
--     topic, which is a deliberate hold, not an oversight.
--   - An info-less topic now exists in production for the first time, so the
--     product page's card-or-nothing branch stops being theoretical.
--
-- ADD VALUE appends to the end of the enum. That ordinal is meaningless here:
-- display order is a hand-maintained tuple in src/lib/products/topics.ts,
-- precisely because the enum's own order is just the order values were added.
-- IF NOT EXISTS keeps a re-run harmless, and no statement below reads the new
-- values, so this stays safe to apply inside a transaction.

ALTER TYPE public.product_topic ADD VALUE IF NOT EXISTS 'rocket_league';
ALTER TYPE public.product_topic ADD VALUE IF NOT EXISTS 'creator_studio';
ALTER TYPE public.product_topic ADD VALUE IF NOT EXISTS 'programming';
ALTER TYPE public.product_topic ADD VALUE IF NOT EXISTS 'ai';
ALTER TYPE public.product_topic ADD VALUE IF NOT EXISTS 'esports';
