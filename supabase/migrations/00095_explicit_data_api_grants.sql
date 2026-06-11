-- Explicit Data API grants for every existing public-schema object.
--
-- Supabase CLI v2.106.0 (2026-06-11) stopped auto-granting Data API privileges
-- (anon / authenticated / service_role) to objects created in `public` on fresh
-- local stacks, and the hosted platform applies the same default to objects
-- created after 2026-10-30 (github.com/orgs/supabase/discussions/45329). Every
-- migration before this one was written under the old auto-expose regime and
-- carries no GRANTs of its own, so a from-scratch database (CI, new dev
-- machines) comes up with every table and function unreachable — even by
-- service_role.
--
-- This migration replays the live ACL state, transcribed verbatim from
-- supabase/schema.sql (the pg_dump of prod). On hosted databases it is a pure
-- no-op: every statement re-asserts a grant that already exists. On fresh
-- stacks it recreates prod's exact access surface — including the deliberate
-- *absences*: grant-locked tables (participations, payments, ...) appear here
-- with SELECT-only or no authenticated grants, which is why this is a
-- per-object transcript and NOT a blanket `GRANT ... ON ALL TABLES`.
--
-- Deliberately NOT replayed: prod's `ALTER DEFAULT PRIVILEGES` auto-expose
-- defaults. Fresh stacks keep the new no-default behavior, so a future
-- migration that creates an object and forgets its explicit GRANTs fails the
-- CI DB tests instead of silently auto-exposing. From 00096 onward, every
-- migration grants what it creates (see CLAUDE.md).

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
REVOKE ALL ON FUNCTION public._list_cron_jobs() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_cron_jobs() TO service_role;
REVOKE ALL ON FUNCTION public._list_rpc_access() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_rpc_access() TO service_role;
REVOKE ALL ON FUNCTION public._list_security_definer_without_search_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_security_definer_without_search_path() TO service_role;
REVOKE ALL ON FUNCTION public._list_table_grants() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_table_grants() TO service_role;
REVOKE ALL ON FUNCTION public._list_tables_without_rls() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_tables_without_rls() TO service_role;
REVOKE ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) TO service_role;
GRANT ALL ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.can_read_product(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_read_product(p_product_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_read_product(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_read_product(p_product_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) TO service_role;
REVOKE ALL ON FUNCTION public.confirm_reservation(p_reservation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_reservation(p_reservation_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.count_active_seats(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_active_seats(p_product_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.count_seats_taken(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_seats_taken(p_product_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) TO service_role;
REVOKE ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.effective_status(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.effective_status(p_product_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.ensure_product_keeps_at_least_one_translation() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_product_keeps_at_least_one_translation() TO service_role;
REVOKE ALL ON FUNCTION public.expire_reservation(p_reservation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.expire_reservation(p_reservation_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO service_role;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT ALL ON TABLE public.profiles TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT UPDATE(phone) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(spoken_languages) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(first_name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE(last_name) ON TABLE public.profiles TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_gamers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_gamers() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_gamers() TO service_role;
REVOKE ALL ON FUNCTION public.get_my_parents() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_parents() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_parents() TO service_role;
REVOKE ALL ON FUNCTION public.get_my_participation_subscription_states() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_participation_subscription_states() TO service_role;
GRANT ALL ON FUNCTION public.get_my_participation_subscription_states() TO authenticated;
REVOKE ALL ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_role() TO service_role;
GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;
GRANT ALL ON FUNCTION public.handle_orphaned_gamer() TO anon;
GRANT ALL ON FUNCTION public.handle_orphaned_gamer() TO authenticated;
GRANT ALL ON FUNCTION public.handle_orphaned_gamer() TO service_role;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;
REVOKE ALL ON FUNCTION public.is_parent_of(gamer_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_parent_of(gamer_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_parent_of(gamer_uuid uuid) TO service_role;
REVOKE ALL ON FUNCTION public.join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pin_is_set() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pin_is_set() TO service_role;
GRANT ALL ON FUNCTION public.pin_is_set() TO authenticated;
REVOKE ALL ON FUNCTION public.product_has_session(p_product_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.product_has_session(p_product_id uuid, p_session_date date) TO service_role;
REVOKE ALL ON FUNCTION public.promote_from_waitlist(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.promote_from_waitlist(p_product_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.refresh_product_seat_counts(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_product_seat_counts(p_product_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.set_my_pin(p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_my_pin(p_pin text) TO service_role;
GRANT ALL ON FUNCTION public.set_my_pin(p_pin text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_pin_for_user(p_user_id uuid, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_pin_for_user(p_user_id uuid, p_pin text) TO service_role;
REVOKE ALL ON FUNCTION public.submit_feedback(p_user_id uuid, p_message text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_feedback(p_user_id uuid, p_message text) TO service_role;
REVOKE ALL ON FUNCTION public.trg_refresh_product_seat_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_refresh_product_seat_counts() TO service_role;
REVOKE ALL ON FUNCTION public.trg_seed_product_seat_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trg_seed_product_seat_counts() TO service_role;
REVOKE ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;
REVOKE ALL ON FUNCTION public.validate_gedu_assignment_product() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_gedu_assignment_product() TO service_role;
GRANT ALL ON FUNCTION public.validate_parent_gamer_roles() TO anon;
GRANT ALL ON FUNCTION public.validate_parent_gamer_roles() TO authenticated;
GRANT ALL ON FUNCTION public.validate_parent_gamer_roles() TO service_role;
REVOKE ALL ON FUNCTION public.validate_participations_group() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_participations_group() TO service_role;
REVOKE ALL ON FUNCTION public.validate_products_location() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_products_location() TO service_role;
REVOKE ALL ON FUNCTION public.validate_profile_spoken_languages() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_profile_spoken_languages() TO service_role;
REVOKE ALL ON FUNCTION public.validate_site_details_location() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_site_details_location() TO service_role;
REVOKE ALL ON FUNCTION public.verify_my_pin(p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verify_my_pin(p_pin text) TO service_role;
GRANT ALL ON FUNCTION public.verify_my_pin(p_pin text) TO authenticated;
GRANT ALL ON TABLE public.calendar_holidays TO anon;
GRANT ALL ON TABLE public.calendar_holidays TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.calendar_holidays TO authenticated;
GRANT ALL ON TABLE public.customer_profiles TO anon;
GRANT ALL ON TABLE public.customer_profiles TO authenticated;
GRANT ALL ON TABLE public.customer_profiles TO service_role;
GRANT ALL ON TABLE public.family_subscriptions TO anon;
GRANT ALL ON TABLE public.family_subscriptions TO service_role;
GRANT SELECT ON TABLE public.family_subscriptions TO authenticated;
GRANT ALL ON TABLE public.feedback_submissions TO anon;
GRANT ALL ON TABLE public.feedback_submissions TO service_role;
GRANT SELECT ON TABLE public.feedback_submissions TO authenticated;
GRANT ALL ON TABLE public.gamer_profiles TO anon;
GRANT ALL ON TABLE public.gamer_profiles TO authenticated;
GRANT ALL ON TABLE public.gamer_profiles TO service_role;
GRANT ALL ON TABLE public.gedu_group_assignments TO anon;
GRANT ALL ON TABLE public.gedu_group_assignments TO service_role;
GRANT SELECT ON TABLE public.gedu_group_assignments TO authenticated;
GRANT ALL ON TABLE public.gedu_locations TO anon;
GRANT ALL ON TABLE public.gedu_locations TO service_role;
GRANT SELECT,INSERT,DELETE ON TABLE public.gedu_locations TO authenticated;
GRANT ALL ON TABLE public.holiday_calendars TO anon;
GRANT ALL ON TABLE public.holiday_calendars TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.holiday_calendars TO authenticated;
GRANT ALL ON TABLE public.locations TO anon;
GRANT ALL ON TABLE public.locations TO service_role;
GRANT SELECT,DELETE ON TABLE public.locations TO authenticated;
GRANT ALL ON TABLE public.minecraft_accounts TO anon;
GRANT ALL ON TABLE public.minecraft_accounts TO service_role;
GRANT SELECT ON TABLE public.minecraft_accounts TO authenticated;
GRANT ALL ON TABLE public.parent_gamer TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.parent_gamer TO authenticated;
GRANT ALL ON TABLE public.parent_gamer TO service_role;
GRANT ALL ON TABLE public.participations TO anon;
GRANT ALL ON TABLE public.participations TO service_role;
GRANT SELECT ON TABLE public.participations TO authenticated;
GRANT ALL ON TABLE public.payments TO anon;
GRANT ALL ON TABLE public.payments TO service_role;
GRANT SELECT ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.product_groups TO anon;
GRANT ALL ON TABLE public.product_groups TO service_role;
GRANT SELECT ON TABLE public.product_groups TO authenticated;
GRANT ALL ON TABLE public.product_holiday_calendars TO anon;
GRANT ALL ON TABLE public.product_holiday_calendars TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_holiday_calendars TO authenticated;
GRANT ALL ON TABLE public.product_prices TO anon;
GRANT ALL ON TABLE public.product_prices TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_prices TO authenticated;
GRANT ALL ON TABLE public.product_seat_counts TO service_role;
GRANT SELECT ON TABLE public.product_seat_counts TO anon;
GRANT SELECT ON TABLE public.product_seat_counts TO authenticated;
GRANT ALL ON TABLE public.product_subscription_prices TO anon;
GRANT ALL ON TABLE public.product_subscription_prices TO service_role;
GRANT ALL ON TABLE public.product_translations TO anon;
GRANT ALL ON TABLE public.product_translations TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_translations TO authenticated;
GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.refunds TO anon;
GRANT ALL ON TABLE public.refunds TO service_role;
GRANT SELECT ON TABLE public.refunds TO authenticated;
GRANT ALL ON TABLE public.schedule_slots TO anon;
GRANT ALL ON TABLE public.schedule_slots TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.schedule_slots TO authenticated;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.site_details TO anon;
GRANT ALL ON TABLE public.site_details TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.site_details TO authenticated;
GRANT ALL ON TABLE public.site_staff_details TO anon;
GRANT ALL ON TABLE public.site_staff_details TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.site_staff_details TO authenticated;
GRANT ALL ON TABLE public.spoken_languages TO anon;
GRANT ALL ON TABLE public.spoken_languages TO service_role;
GRANT SELECT ON TABLE public.spoken_languages TO authenticated;
GRANT ALL ON TABLE public.whatsapp_contacts TO anon;
GRANT ALL ON TABLE public.whatsapp_contacts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.whatsapp_contacts TO authenticated;
GRANT ALL ON TABLE public.whatsapp_messages TO anon;
GRANT ALL ON TABLE public.whatsapp_messages TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.whatsapp_messages TO authenticated;
