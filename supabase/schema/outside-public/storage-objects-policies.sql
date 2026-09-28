-- RLS policies on storage.objects — the whole of our storage authorization, since the image enables row security on that table.
-- Generated from the database by `npm run db -- generate`; never hand-edited.

CREATE POLICY chat_images_member_read ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((bucket_id = 'chat-images'::text) AND (EXISTS ( SELECT 1
   FROM public.chat_messages m
  WHERE ((m.id =
        CASE
            WHEN (objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) THEN (objects.name)::uuid
            ELSE NULL::uuid
        END) AND public.is_chat_channel_member(m.channel_id) AND ((m.hidden_at IS NULL) OR public.is_chat_channel_moderator(m.channel_id)))))));

CREATE POLICY product_images_admin_delete ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'product-images'::text) AND (public.get_user_role() = 'admin'::public.user_role)));

CREATE POLICY product_images_admin_insert ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'product-images'::text) AND (public.get_user_role() = 'admin'::public.user_role)));

CREATE POLICY product_images_admin_update ON storage.objects
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'product-images'::text) AND (public.get_user_role() = 'admin'::public.user_role)))
  WITH CHECK (((bucket_id = 'product-images'::text) AND (public.get_user_role() = 'admin'::public.user_role)));
