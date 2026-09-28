-- Triggers on auth.users. The auth schema belongs to the platform, so no dump of public carries them.
-- Generated from the database by `npm run db -- generate`; never hand-edited.

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
