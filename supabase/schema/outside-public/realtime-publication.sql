-- Tables in the supabase_realtime publication. The publication itself is pre-created empty, so membership is all there is to restore.
-- Generated from the database by `npm run db -- generate`; never hand-edited.

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_locks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_seat_counts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_private_zone_occupants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_zones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
