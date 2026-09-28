-- Storage buckets. Rows in storage.buckets rather than DDL, rendered as the statements that put them back.
-- Generated from the database by `npm run db -- generate`; never hand-edited.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-images', 'chat-images', false, 3145728, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('session-images', 'session-images', true, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
