-- Team photos are stored by their upload route alone.
--
-- A signed-in editor uploaded the cropped photo straight into the bucket, so
-- nothing on the server stripped its metadata or checked its size. The app's
-- team photo upload route now stores every one, on the service role, after
-- checking the caller may edit the profile, and re-encodes the bytes with all
-- metadata gone and holds them to the stored size. The insert policy goes, so
-- no signed-in client can write the bucket; the delete policy stays, because
-- the editor's save still removes a refused crop and sweeps the folder on the
-- caller's own client. The re-encode only ever produces a JPEG, so the bucket
-- admits nothing else.

DROP POLICY team_photos_editor_insert ON storage.objects;

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg']
 WHERE id = 'team-photos';

COMMENT ON COLUMN public.team_profiles.photo_path IS 'The photo''s object name in the team-photos bucket, always inside the person''s own folder: <user_id>/<name>. The team photo upload route stores every object there, a JPEG at exactly the team photo''s stored size with its metadata stripped. NULL for none, which keeps the profile incomplete.';

COMMENT ON FUNCTION public.can_edit_team_profile(p_user_id uuid) IS 'Whether the caller may write this person''s team profile, checkbox and photo: their own as an admin or a Gedu, or any admin''s or Gedu''s as an admin. A total boolean (false for NULL). SECURITY INVOKER: it reads only the caller''s own role and a profiles row the caller''s RLS already shows them (an admin reads every profile), so it cannot answer about anything the caller could not see. The team photo upload route asks it before storing, and the team-photos delete policy and save_team_profile ask it too.';
