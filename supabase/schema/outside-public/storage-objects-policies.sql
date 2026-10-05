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

CREATE POLICY landing_images_admin_delete ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'landing-images'::text) AND (public.get_user_role() = 'admin'::public.user_role)));

CREATE POLICY landing_images_admin_insert ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'landing-images'::text) AND (public.get_user_role() = 'admin'::public.user_role)));

CREATE POLICY landing_images_admin_update ON storage.objects
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'landing-images'::text) AND (public.get_user_role() = 'admin'::public.user_role)))
  WITH CHECK (((bucket_id = 'landing-images'::text) AND (public.get_user_role() = 'admin'::public.user_role)));

CREATE POLICY library_covers_admin_delete ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'library-covers'::text) AND (public.get_user_role() = 'admin'::public.user_role)));

CREATE POLICY library_covers_admin_insert ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'library-covers'::text) AND (public.get_user_role() = 'admin'::public.user_role)));

CREATE POLICY library_covers_admin_update ON storage.objects
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'library-covers'::text) AND (public.get_user_role() = 'admin'::public.user_role)))
  WITH CHECK (((bucket_id = 'library-covers'::text) AND (public.get_user_role() = 'admin'::public.user_role)));

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

CREATE POLICY team_photos_editor_delete ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'team-photos'::text) AND public.can_edit_team_profile(
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) THEN ((storage.foldername(name))[1])::uuid
    ELSE NULL::uuid
END)));

CREATE POLICY team_photos_editor_insert ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'team-photos'::text) AND (array_length(storage.foldername(name), 1) = 1) AND public.can_edit_team_profile(
CASE
    WHEN ((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) THEN ((storage.foldername(name))[1])::uuid
    ELSE NULL::uuid
END)));

CREATE POLICY team_photos_owner_or_admin_read ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((bucket_id = 'team-photos'::text) AND (( SELECT public.is_admin() AS is_admin) OR ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))));

CREATE POLICY team_photos_public_read ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO anon, authenticated
  USING (((bucket_id = 'team-photos'::text) AND public.is_public_team_photo(name)));
