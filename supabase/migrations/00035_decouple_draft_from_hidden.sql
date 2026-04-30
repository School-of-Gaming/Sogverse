-- Decouple `status = 'draft'` from `is_visible = false`.
--
-- The admin create form previously tied the two together: unticking
-- "Make visible" both hid the product AND set status to 'draft'. That
-- conflated two orthogonal ideas:
--
--   * `is_visible`  — should parents see this on browse pages?
--   * `status='draft'` — is this product *incomplete* (mandatory fields
--                        not yet filled in)?
--
-- Today the form's validate() always requires every mandatory field
-- before it'll submit, so every row created via the UI is fully
-- populated. Calling those rows "draft" was misleading — they're just
-- complete-but-hidden. The form now emits `status: "pending"`
-- unconditionally; visibility is the sole knob.
--
-- This migration realigns the existing rows. Any product currently
-- sitting at status='draft' is — by virtue of the old form behavior —
-- also is_visible=false, so the products stay hidden after this update.
-- They just stop being mislabeled as "draft" in the admin list UI.
--
-- The `draft` enum value, the column default, and the constraint escape
-- hatches all stay in place. They're reserved for a future "save
-- incomplete product" admin flow that would deliberately create rows
-- with mandatory fields unset.

UPDATE public.products_v2
SET status = 'pending'
WHERE status = 'draft';
