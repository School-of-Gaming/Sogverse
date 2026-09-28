-- Digital Safety joins product_topic, on the label-only side of the enum.
--
-- It names subject matter rather than a piece of software — what a group uses
-- to learn about staying safe online is a fact about the individual product,
-- not about the topic. So it follows Programming and AI exactly: an entry in
-- src/lib/products/topics.ts carrying a literal label and no `info` block,
-- which is what makes the product page skip the "About X" card rather than
-- render a generic one at the wrong altitude. What a family needs in order to
-- take part is written per product into that product's own description.
--
-- The label is an English literal like every other topic label. Digital Safety
-- is a common noun, so it sits with Programming, AI and Esports under the
-- never-translated rule rather than with the proper nouns.
--
-- ADD VALUE appends to the end of the enum. That ordinal is meaningless here:
-- display order is a hand-maintained tuple in src/lib/products/topics.ts.
-- IF NOT EXISTS keeps a re-run harmless, and no statement below reads the new
-- value, so this stays safe to apply inside a transaction.

ALTER TYPE public.product_topic ADD VALUE IF NOT EXISTS 'digital_safety';
