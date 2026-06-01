-- Rename the entire `_v2` product domain to canonical names.
--
-- v1 is gone (migrations 00059/00060/00071), so every canonical name is free.
-- This strips the version distinction everywhere in the database: tables,
-- enum types, functions, and all internal object names (constraints, indexes,
-- triggers, RLS policies) so no `_v2` remains anywhere — including the
-- foreignKeyName literals in the generated TypeScript types.
--
-- Mechanics:
--   * ALTER TYPE / ALTER TABLE renames are catalog-level (OID-followed): FK
--     targets, column types, and function arg/return types update automatically.
--   * Constraints/indexes/triggers/policies are renamed explicitly (their names
--     don't auto-follow a table rename).
--   * plpgsql function BODIES are opaque text and are NOT touched by a rename,
--     so every function that references a `_v2` object is re-issued via
--     CREATE OR REPLACE with the suffix stripped. (ALTER FUNCTION ... RENAME
--     handles the name; CREATE OR REPLACE fixes the body. Grants/RLS are
--     preserved by both.)
--
-- This file was generated from the live schema (pg_get_functiondef + a textual
-- `_v2` strip) and verified with a transactional BEGIN/ROLLBACK dry-run before
-- committing. The application code, i18n keys, and docs are de-versioned in the
-- same PR.

-- 1. Enum type renames
ALTER TYPE public.billing_mode_v2 RENAME TO billing_mode;
ALTER TYPE public.effective_product_status_v2 RENAME TO effective_product_status;
ALTER TYPE public.participation_status_v2 RENAME TO participation_status;
ALTER TYPE public.payment_purpose_v2 RENAME TO payment_purpose;
ALTER TYPE public.product_status_v2 RENAME TO product_status;
ALTER TYPE public.product_type_v2 RENAME TO product_type;
ALTER TYPE public.refund_reason_v2 RENAME TO refund_reason;
ALTER TYPE public.subscription_frequency_v2 RENAME TO subscription_frequency;
ALTER TYPE public.topic_kind_v2 RENAME TO topic_kind;

-- 2. Table renames
ALTER TABLE public.calendar_holidays_v2 RENAME TO calendar_holidays;
ALTER TABLE public.credit_deductions_v2 RENAME TO credit_deductions;
ALTER TABLE public.family_subscription_items_v2 RENAME TO family_subscription_items;
ALTER TABLE public.family_subscriptions_v2 RENAME TO family_subscriptions;
ALTER TABLE public.gedu_group_assignments_v2 RENAME TO gedu_group_assignments;
ALTER TABLE public.holiday_calendars_v2 RENAME TO holiday_calendars;
ALTER TABLE public.participations_v2 RENAME TO participations;
ALTER TABLE public.payments_v2 RENAME TO payments;
ALTER TABLE public.product_groups_v2 RENAME TO product_groups;
ALTER TABLE public.product_holiday_calendars_v2 RENAME TO product_holiday_calendars;
ALTER TABLE public.product_prices_v2 RENAME TO product_prices;
ALTER TABLE public.product_seat_counts_v2 RENAME TO product_seat_counts;
ALTER TABLE public.product_subscription_prices_v2 RENAME TO product_subscription_prices;
ALTER TABLE public.product_tags_v2 RENAME TO product_tags;
ALTER TABLE public.product_translations_v2 RENAME TO product_translations;
ALTER TABLE public.products_v2 RENAME TO products;
ALTER TABLE public.refunds_v2 RENAME TO refunds;
ALTER TABLE public.schedule_slots_v2 RENAME TO schedule_slots;
ALTER TABLE public.session_cancellations_v2 RENAME TO session_cancellations;
ALTER TABLE public.site_details_v2 RENAME TO site_details;
ALTER TABLE public.site_staff_details_v2 RENAME TO site_staff_details;
ALTER TABLE public.tag_translations_v2 RENAME TO tag_translations;
ALTER TABLE public.tags_v2 RENAME TO tags;
ALTER TABLE public.topic_translations_v2 RENAME TO topic_translations;
ALTER TABLE public.topics_v2 RENAME TO topics;

-- 3. Constraint renames (FK / CHECK / UNIQUE / PK — also renames backing PK/unique indexes)
ALTER TABLE public.calendar_holidays RENAME CONSTRAINT calendar_holidays_v2_calendar_id_date_key TO calendar_holidays_calendar_id_date_key;
ALTER TABLE public.calendar_holidays RENAME CONSTRAINT calendar_holidays_v2_calendar_id_fkey TO calendar_holidays_calendar_id_fkey;
ALTER TABLE public.calendar_holidays RENAME CONSTRAINT calendar_holidays_v2_pkey TO calendar_holidays_pkey;
ALTER TABLE public.credit_deductions RENAME CONSTRAINT credit_deductions_v2_delta_check TO credit_deductions_delta_check;
ALTER TABLE public.credit_deductions RENAME CONSTRAINT credit_deductions_v2_gamer_id_fkey TO credit_deductions_gamer_id_fkey;
ALTER TABLE public.credit_deductions RENAME CONSTRAINT credit_deductions_v2_participation_id_fkey TO credit_deductions_participation_id_fkey;
ALTER TABLE public.credit_deductions RENAME CONSTRAINT credit_deductions_v2_participation_id_session_date_key TO credit_deductions_participation_id_session_date_key;
ALTER TABLE public.credit_deductions RENAME CONSTRAINT credit_deductions_v2_pkey TO credit_deductions_pkey;
ALTER TABLE public.credit_deductions RENAME CONSTRAINT credit_deductions_v2_product_id_fkey TO credit_deductions_product_id_fkey;
ALTER TABLE public.family_subscription_items RENAME CONSTRAINT family_subscription_items_v2_family_subscription_id_fkey TO family_subscription_items_family_subscription_id_fkey;
ALTER TABLE public.family_subscription_items RENAME CONSTRAINT family_subscription_items_v2_participation_id_fkey TO family_subscription_items_participation_id_fkey;
ALTER TABLE public.family_subscription_items RENAME CONSTRAINT family_subscription_items_v2_participation_id_key TO family_subscription_items_participation_id_key;
ALTER TABLE public.family_subscription_items RENAME CONSTRAINT family_subscription_items_v2_pkey TO family_subscription_items_pkey;
ALTER TABLE public.family_subscription_items RENAME CONSTRAINT family_subscription_items_v2_stripe_subscription_item_id_key TO family_subscription_items_stripe_subscription_item_id_key;
ALTER TABLE public.family_subscriptions RENAME CONSTRAINT family_subscriptions_v2_currency_check TO family_subscriptions_currency_check;
ALTER TABLE public.family_subscriptions RENAME CONSTRAINT family_subscriptions_v2_customer_id_fkey TO family_subscriptions_customer_id_fkey;
ALTER TABLE public.family_subscriptions RENAME CONSTRAINT family_subscriptions_v2_customer_id_frequency_currency_key TO family_subscriptions_customer_id_frequency_currency_key;
ALTER TABLE public.family_subscriptions RENAME CONSTRAINT family_subscriptions_v2_pkey TO family_subscriptions_pkey;
ALTER TABLE public.family_subscriptions RENAME CONSTRAINT family_subscriptions_v2_status_check TO family_subscriptions_status_check;
ALTER TABLE public.family_subscriptions RENAME CONSTRAINT family_subscriptions_v2_stripe_subscription_id_key TO family_subscriptions_stripe_subscription_id_key;
ALTER TABLE public.gedu_group_assignments RENAME CONSTRAINT gedu_group_assignments_v2_gedu_id_fkey TO gedu_group_assignments_gedu_id_fkey;
ALTER TABLE public.gedu_group_assignments RENAME CONSTRAINT gedu_group_assignments_v2_gedu_id_product_id_key TO gedu_group_assignments_gedu_id_product_id_key;
ALTER TABLE public.gedu_group_assignments RENAME CONSTRAINT gedu_group_assignments_v2_group_id_fkey TO gedu_group_assignments_group_id_fkey;
ALTER TABLE public.gedu_group_assignments RENAME CONSTRAINT gedu_group_assignments_v2_pkey TO gedu_group_assignments_pkey;
ALTER TABLE public.gedu_group_assignments RENAME CONSTRAINT gedu_group_assignments_v2_product_id_fkey TO gedu_group_assignments_product_id_fkey;
ALTER TABLE public.holiday_calendars RENAME CONSTRAINT holiday_calendars_v2_pkey TO holiday_calendars_pkey;
ALTER TABLE public.participations RENAME CONSTRAINT chk_participations_v2_credits_non_negative TO chk_participations_credits_non_negative;
ALTER TABLE public.participations RENAME CONSTRAINT chk_participations_v2_no_self_signup TO chk_participations_no_self_signup;
ALTER TABLE public.participations RENAME CONSTRAINT chk_participations_v2_reserving_has_until TO chk_participations_reserving_has_until;
ALTER TABLE public.participations RENAME CONSTRAINT chk_participations_v2_waitlisted_has_position TO chk_participations_waitlisted_has_position;
ALTER TABLE public.participations RENAME CONSTRAINT participations_v2_customer_id_fkey TO participations_customer_id_fkey;
ALTER TABLE public.participations RENAME CONSTRAINT participations_v2_gamer_id_fkey TO participations_gamer_id_fkey;
ALTER TABLE public.participations RENAME CONSTRAINT participations_v2_group_id_fkey TO participations_group_id_fkey;
ALTER TABLE public.participations RENAME CONSTRAINT participations_v2_pkey TO participations_pkey;
ALTER TABLE public.participations RENAME CONSTRAINT participations_v2_product_id_fkey TO participations_product_id_fkey;
ALTER TABLE public.payments RENAME CONSTRAINT payments_v2_amount_cents_check TO payments_amount_cents_check;
ALTER TABLE public.payments RENAME CONSTRAINT payments_v2_currency_check TO payments_currency_check;
ALTER TABLE public.payments RENAME CONSTRAINT payments_v2_customer_id_fkey TO payments_customer_id_fkey;
ALTER TABLE public.payments RENAME CONSTRAINT payments_v2_pkey TO payments_pkey;
ALTER TABLE public.payments RENAME CONSTRAINT payments_v2_stripe_event_id_key TO payments_stripe_event_id_key;
ALTER TABLE public.product_groups RENAME CONSTRAINT chk_product_groups_v2_name_not_blank TO chk_product_groups_name_not_blank;
ALTER TABLE public.product_groups RENAME CONSTRAINT product_groups_v2_pkey TO product_groups_pkey;
ALTER TABLE public.product_groups RENAME CONSTRAINT product_groups_v2_product_id_fkey TO product_groups_product_id_fkey;
ALTER TABLE public.product_holiday_calendars RENAME CONSTRAINT product_holiday_calendars_v2_calendar_id_fkey TO product_holiday_calendars_calendar_id_fkey;
ALTER TABLE public.product_holiday_calendars RENAME CONSTRAINT product_holiday_calendars_v2_pkey TO product_holiday_calendars_pkey;
ALTER TABLE public.product_holiday_calendars RENAME CONSTRAINT product_holiday_calendars_v2_product_id_fkey TO product_holiday_calendars_product_id_fkey;
ALTER TABLE public.product_prices RENAME CONSTRAINT product_prices_v2_currency_check TO product_prices_currency_check;
ALTER TABLE public.product_prices RENAME CONSTRAINT product_prices_v2_pkey TO product_prices_pkey;
ALTER TABLE public.product_prices RENAME CONSTRAINT product_prices_v2_price_per_month_check TO product_prices_price_per_month_check;
ALTER TABLE public.product_prices RENAME CONSTRAINT product_prices_v2_price_per_session_check TO product_prices_price_per_session_check;
ALTER TABLE public.product_prices RENAME CONSTRAINT product_prices_v2_product_id_fkey TO product_prices_product_id_fkey;
ALTER TABLE public.product_seat_counts RENAME CONSTRAINT product_seat_counts_v2_active_count_check TO product_seat_counts_active_count_check;
ALTER TABLE public.product_seat_counts RENAME CONSTRAINT product_seat_counts_v2_pkey TO product_seat_counts_pkey;
ALTER TABLE public.product_seat_counts RENAME CONSTRAINT product_seat_counts_v2_product_id_fkey TO product_seat_counts_product_id_fkey;
ALTER TABLE public.product_seat_counts RENAME CONSTRAINT product_seat_counts_v2_reserving_count_check TO product_seat_counts_reserving_count_check;
ALTER TABLE public.product_seat_counts RENAME CONSTRAINT product_seat_counts_v2_waitlist_count_check TO product_seat_counts_waitlist_count_check;
ALTER TABLE public.product_subscription_prices RENAME CONSTRAINT product_subscription_prices_v2_currency_check TO product_subscription_prices_currency_check;
ALTER TABLE public.product_subscription_prices RENAME CONSTRAINT product_subscription_prices_v2_pkey TO product_subscription_prices_pkey;
ALTER TABLE public.product_subscription_prices RENAME CONSTRAINT product_subscription_prices_v2_product_id_fkey TO product_subscription_prices_product_id_fkey;
ALTER TABLE public.product_subscription_prices RENAME CONSTRAINT product_subscription_prices_v2_unit_amount_cents_check TO product_subscription_prices_unit_amount_cents_check;
ALTER TABLE public.product_tags RENAME CONSTRAINT product_tags_v2_pkey TO product_tags_pkey;
ALTER TABLE public.product_tags RENAME CONSTRAINT product_tags_v2_product_id_fkey TO product_tags_product_id_fkey;
ALTER TABLE public.product_tags RENAME CONSTRAINT product_tags_v2_tag_id_fkey TO product_tags_tag_id_fkey;
ALTER TABLE public.product_translations RENAME CONSTRAINT product_translations_v2_name_check TO product_translations_name_check;
ALTER TABLE public.product_translations RENAME CONSTRAINT product_translations_v2_pkey TO product_translations_pkey;
ALTER TABLE public.product_translations RENAME CONSTRAINT product_translations_v2_product_id_fkey TO product_translations_product_id_fkey;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_age_range TO chk_products_age_range;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_date_range TO chk_products_date_range;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_draft_implies_hidden TO chk_products_draft_implies_hidden;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_event_single_date TO chk_products_event_single_date;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_external_contract_muni TO chk_products_external_contract_muni;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_in_person_has_location TO chk_products_in_person_has_location;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_non_consumer_has_end_date TO chk_products_non_consumer_has_end_date;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_online_muni_has_location TO chk_products_online_muni_has_location;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_online_non_muni_no_location TO chk_products_online_non_muni_no_location;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_refund_policy_only_for_single_payment TO chk_products_refund_policy_only_for_single_payment;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_running_has_start_date TO chk_products_running_has_start_date;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_seat_count_null_requires_free TO chk_products_seat_count_null_requires_free;
ALTER TABLE public.products RENAME CONSTRAINT chk_products_v2_threshold_within_seat_count TO chk_products_threshold_within_seat_count;
ALTER TABLE public.products RENAME CONSTRAINT products_v2_created_by_fkey TO products_created_by_fkey;
ALTER TABLE public.products RENAME CONSTRAINT products_v2_location_id_fkey TO products_location_id_fkey;
ALTER TABLE public.products RENAME CONSTRAINT products_v2_max_age_check TO products_max_age_check;
ALTER TABLE public.products RENAME CONSTRAINT products_v2_min_age_check TO products_min_age_check;
ALTER TABLE public.products RENAME CONSTRAINT products_v2_pkey TO products_pkey;
ALTER TABLE public.products RENAME CONSTRAINT products_v2_refund_policy_days_check TO products_refund_policy_days_check;
ALTER TABLE public.products RENAME CONSTRAINT products_v2_seat_count_check TO products_seat_count_check;
ALTER TABLE public.products RENAME CONSTRAINT products_v2_signup_threshold_check TO products_signup_threshold_check;
ALTER TABLE public.products RENAME CONSTRAINT products_v2_spoken_language_code_fkey TO products_spoken_language_code_fkey;
ALTER TABLE public.products RENAME CONSTRAINT products_v2_topic_id_fkey TO products_topic_id_fkey;
ALTER TABLE public.refunds RENAME CONSTRAINT refunds_v2_amount_cents_check TO refunds_amount_cents_check;
ALTER TABLE public.refunds RENAME CONSTRAINT refunds_v2_payment_id_fkey TO refunds_payment_id_fkey;
ALTER TABLE public.refunds RENAME CONSTRAINT refunds_v2_pkey TO refunds_pkey;
ALTER TABLE public.refunds RENAME CONSTRAINT refunds_v2_stripe_event_id_key TO refunds_stripe_event_id_key;
ALTER TABLE public.refunds RENAME CONSTRAINT refunds_v2_stripe_refund_id_key TO refunds_stripe_refund_id_key;
ALTER TABLE public.schedule_slots RENAME CONSTRAINT schedule_slots_v2_duration_minutes_check TO schedule_slots_duration_minutes_check;
ALTER TABLE public.schedule_slots RENAME CONSTRAINT schedule_slots_v2_pkey TO schedule_slots_pkey;
ALTER TABLE public.schedule_slots RENAME CONSTRAINT schedule_slots_v2_product_id_fkey TO schedule_slots_product_id_fkey;
ALTER TABLE public.schedule_slots RENAME CONSTRAINT schedule_slots_v2_product_id_weekday_key TO schedule_slots_product_id_weekday_key;
ALTER TABLE public.schedule_slots RENAME CONSTRAINT schedule_slots_v2_weekday_check TO schedule_slots_weekday_check;
ALTER TABLE public.session_cancellations RENAME CONSTRAINT session_cancellations_v2_participation_id_fkey TO session_cancellations_participation_id_fkey;
ALTER TABLE public.session_cancellations RENAME CONSTRAINT session_cancellations_v2_participation_id_session_date_key TO session_cancellations_participation_id_session_date_key;
ALTER TABLE public.session_cancellations RENAME CONSTRAINT session_cancellations_v2_pkey TO session_cancellations_pkey;
ALTER TABLE public.site_details RENAME CONSTRAINT site_details_v2_location_id_fkey TO site_details_location_id_fkey;
ALTER TABLE public.site_details RENAME CONSTRAINT site_details_v2_pkey TO site_details_pkey;
ALTER TABLE public.site_staff_details RENAME CONSTRAINT site_staff_details_v2_location_id_fkey TO site_staff_details_location_id_fkey;
ALTER TABLE public.site_staff_details RENAME CONSTRAINT site_staff_details_v2_pkey TO site_staff_details_pkey;
ALTER TABLE public.tag_translations RENAME CONSTRAINT tag_translations_v2_name_check TO tag_translations_name_check;
ALTER TABLE public.tag_translations RENAME CONSTRAINT tag_translations_v2_pkey TO tag_translations_pkey;
ALTER TABLE public.tag_translations RENAME CONSTRAINT tag_translations_v2_tag_id_fkey TO tag_translations_tag_id_fkey;
ALTER TABLE public.tags RENAME CONSTRAINT tags_v2_pkey TO tags_pkey;
ALTER TABLE public.tags RENAME CONSTRAINT tags_v2_slug_key TO tags_slug_key;
ALTER TABLE public.topic_translations RENAME CONSTRAINT topic_translations_v2_name_check TO topic_translations_name_check;
ALTER TABLE public.topic_translations RENAME CONSTRAINT topic_translations_v2_pkey TO topic_translations_pkey;
ALTER TABLE public.topic_translations RENAME CONSTRAINT topic_translations_v2_topic_id_fkey TO topic_translations_topic_id_fkey;
ALTER TABLE public.topics RENAME CONSTRAINT topics_v2_pkey TO topics_pkey;
ALTER TABLE public.topics RENAME CONSTRAINT topics_v2_slug_key TO topics_slug_key;

-- 4. Standalone index renames (exclude indexes backing a constraint — already renamed above)
ALTER INDEX public.idx_calendar_holidays_v2_date RENAME TO idx_calendar_holidays_date;
ALTER INDEX public.idx_credit_deductions_v2_processed_at RENAME TO idx_credit_deductions_processed_at;
ALTER INDEX public.idx_family_subscription_items_v2_participation RENAME TO idx_family_subscription_items_participation;
ALTER INDEX public.idx_family_subscriptions_v2_customer RENAME TO idx_family_subscriptions_customer;
ALTER INDEX public.idx_gedu_group_assignments_v2_gedu RENAME TO idx_gedu_group_assignments_gedu;
ALTER INDEX public.idx_gedu_group_assignments_v2_product RENAME TO idx_gedu_group_assignments_product;
ALTER INDEX public.idx_participations_v2_active RENAME TO idx_participations_active;
ALTER INDEX public.idx_participations_v2_customer RENAME TO idx_participations_customer;
ALTER INDEX public.idx_participations_v2_gamer RENAME TO idx_participations_gamer;
ALTER INDEX public.idx_participations_v2_group RENAME TO idx_participations_group;
ALTER INDEX public.idx_participations_v2_reserving_live RENAME TO idx_participations_reserving_live;
ALTER INDEX public.idx_participations_v2_waitlisted RENAME TO idx_participations_waitlisted;
ALTER INDEX public.idx_payments_v2_customer RENAME TO idx_payments_customer;
ALTER INDEX public.idx_payments_v2_invoice RENAME TO idx_payments_invoice;
ALTER INDEX public.idx_payments_v2_payment_intent RENAME TO idx_payments_payment_intent;
ALTER INDEX public.idx_product_groups_v2_product RENAME TO idx_product_groups_product;
ALTER INDEX public.idx_product_holiday_calendars_v2_calendar RENAME TO idx_product_holiday_calendars_calendar;
ALTER INDEX public.idx_product_tags_v2_tag RENAME TO idx_product_tags_tag;
ALTER INDEX public.idx_product_translations_v2_locale RENAME TO idx_product_translations_locale;
ALTER INDEX public.idx_products_v2_location RENAME TO idx_products_location;
ALTER INDEX public.idx_products_v2_reg_opens_at RENAME TO idx_products_reg_opens_at;
ALTER INDEX public.idx_products_v2_status RENAME TO idx_products_status;
ALTER INDEX public.idx_products_v2_topic RENAME TO idx_products_topic;
ALTER INDEX public.idx_products_v2_type RENAME TO idx_products_type;
ALTER INDEX public.idx_products_v2_visible RENAME TO idx_products_visible;
ALTER INDEX public.idx_refunds_v2_payment RENAME TO idx_refunds_payment;
ALTER INDEX public.idx_schedule_slots_v2_product RENAME TO idx_schedule_slots_product;
ALTER INDEX public.idx_session_cancellations_v2_session_date RENAME TO idx_session_cancellations_session_date;
ALTER INDEX public.idx_tag_translations_v2_locale RENAME TO idx_tag_translations_locale;
ALTER INDEX public.idx_topic_translations_v2_locale RENAME TO idx_topic_translations_locale;
ALTER INDEX public.idx_topics_v2_kind RENAME TO idx_topics_kind;
ALTER INDEX public.uq_participations_v2_active_or_waitlisted RENAME TO uq_participations_active_or_waitlisted;

-- 5. Sequence renames (expected: none — all PKs use gen_random_uuid)

-- 6. Trigger renames
ALTER TRIGGER family_subscriptions_v2_updated_at ON public.family_subscriptions RENAME TO family_subscriptions_updated_at;
ALTER TRIGGER trg_validate_gedu_assignment_v2_product ON public.gedu_group_assignments RENAME TO trg_validate_gedu_assignment_product;
ALTER TRIGGER holiday_calendars_v2_updated_at ON public.holiday_calendars RENAME TO holiday_calendars_updated_at;
ALTER TRIGGER participations_v2_updated_at ON public.participations RENAME TO participations_updated_at;
ALTER TRIGGER trg_participations_v2_refresh_counts_del ON public.participations RENAME TO trg_participations_refresh_counts_del;
ALTER TRIGGER trg_participations_v2_refresh_counts_ins ON public.participations RENAME TO trg_participations_refresh_counts_ins;
ALTER TRIGGER trg_participations_v2_refresh_counts_upd ON public.participations RENAME TO trg_participations_refresh_counts_upd;
ALTER TRIGGER trg_validate_participations_v2_group ON public.participations RENAME TO trg_validate_participations_group;
ALTER TRIGGER product_groups_v2_updated_at ON public.product_groups RENAME TO product_groups_updated_at;
ALTER TRIGGER product_prices_v2_updated_at ON public.product_prices RENAME TO product_prices_updated_at;
ALTER TRIGGER product_translations_v2_updated_at ON public.product_translations RENAME TO product_translations_updated_at;
ALTER TRIGGER products_v2_updated_at ON public.products RENAME TO products_updated_at;
ALTER TRIGGER trg_products_v2_seed_seat_counts ON public.products RENAME TO trg_products_seed_seat_counts;
ALTER TRIGGER trg_validate_products_v2_location ON public.products RENAME TO trg_validate_products_location;
ALTER TRIGGER schedule_slots_v2_updated_at ON public.schedule_slots RENAME TO schedule_slots_updated_at;
ALTER TRIGGER site_details_v2_updated_at ON public.site_details RENAME TO site_details_updated_at;
ALTER TRIGGER trg_validate_site_details_v2_location ON public.site_details RENAME TO trg_validate_site_details_location;
ALTER TRIGGER site_staff_details_v2_updated_at ON public.site_staff_details RENAME TO site_staff_details_updated_at;
ALTER TRIGGER trg_validate_site_staff_details_v2_location ON public.site_staff_details RENAME TO trg_validate_site_staff_details_location;
ALTER TRIGGER tag_translations_v2_updated_at ON public.tag_translations RENAME TO tag_translations_updated_at;
ALTER TRIGGER tags_v2_updated_at ON public.tags RENAME TO tags_updated_at;
ALTER TRIGGER topic_translations_v2_updated_at ON public.topic_translations RENAME TO topic_translations_updated_at;
ALTER TRIGGER topics_v2_updated_at ON public.topics RENAME TO topics_updated_at;

-- 7. RLS policy renames
ALTER POLICY admin_full_access_calendar_holidays_v2 ON public.calendar_holidays RENAME TO admin_full_access_calendar_holidays;
ALTER POLICY public_read_calendar_holidays_v2 ON public.calendar_holidays RENAME TO public_read_calendar_holidays;
ALTER POLICY admin_full_access_credit_deductions_v2 ON public.credit_deductions RENAME TO admin_full_access_credit_deductions;
ALTER POLICY customer_select_own_credit_deductions_v2 ON public.credit_deductions RENAME TO customer_select_own_credit_deductions;
ALTER POLICY admin_full_access_family_subscription_items_v2 ON public.family_subscription_items RENAME TO admin_full_access_family_subscription_items;
ALTER POLICY customer_select_own_family_subscription_items_v2 ON public.family_subscription_items RENAME TO customer_select_own_family_subscription_items;
ALTER POLICY admin_full_access_family_subscriptions_v2 ON public.family_subscriptions RENAME TO admin_full_access_family_subscriptions;
ALTER POLICY customer_select_own_family_subscriptions_v2 ON public.family_subscriptions RENAME TO customer_select_own_family_subscriptions;
ALTER POLICY admin_full_access_gedu_assignments_v2 ON public.gedu_group_assignments RENAME TO admin_full_access_gedu_assignments;
ALTER POLICY customers_read_assignments_via_gamers_v2 ON public.gedu_group_assignments RENAME TO customers_read_assignments_via_gamers;
ALTER POLICY gedus_read_own_assignments_v2 ON public.gedu_group_assignments RENAME TO gedus_read_own_assignments;
ALTER POLICY admin_full_access_holiday_calendars_v2 ON public.holiday_calendars RENAME TO admin_full_access_holiday_calendars;
ALTER POLICY public_read_holiday_calendars_v2 ON public.holiday_calendars RENAME TO public_read_holiday_calendars;
ALTER POLICY admin_full_access_participations_v2 ON public.participations RENAME TO admin_full_access_participations;
ALTER POLICY customer_select_own_participations_v2 ON public.participations RENAME TO customer_select_own_participations;
ALTER POLICY gamer_select_own_participations_v2 ON public.participations RENAME TO gamer_select_own_participations;
ALTER POLICY admin_full_access_payments_v2 ON public.payments RENAME TO admin_full_access_payments;
ALTER POLICY customer_select_own_payments_v2 ON public.payments RENAME TO customer_select_own_payments;
ALTER POLICY admin_full_access_product_groups_v2 ON public.product_groups RENAME TO admin_full_access_product_groups;
ALTER POLICY customers_read_groups_via_gamers_v2 ON public.product_groups RENAME TO customers_read_groups_via_gamers;
ALTER POLICY gamers_read_own_group_v2 ON public.product_groups RENAME TO gamers_read_own_group;
ALTER POLICY gedus_read_assigned_groups_v2 ON public.product_groups RENAME TO gedus_read_assigned_groups;
ALTER POLICY admin_full_access_product_holiday_calendars_v2 ON public.product_holiday_calendars RENAME TO admin_full_access_product_holiday_calendars;
ALTER POLICY read_product_holiday_calendars_v2_via_product ON public.product_holiday_calendars RENAME TO read_product_holiday_calendars_via_product;
ALTER POLICY admin_full_access_product_prices_v2 ON public.product_prices RENAME TO admin_full_access_product_prices;
ALTER POLICY read_product_prices_v2_via_product ON public.product_prices RENAME TO read_product_prices_via_product;
ALTER POLICY public_read_product_seat_counts_v2 ON public.product_seat_counts RENAME TO public_read_product_seat_counts;
ALTER POLICY admin_full_access_product_subscription_prices_v2 ON public.product_subscription_prices RENAME TO admin_full_access_product_subscription_prices;
ALTER POLICY admin_full_access_product_tags_v2 ON public.product_tags RENAME TO admin_full_access_product_tags;
ALTER POLICY read_product_tags_v2_via_product ON public.product_tags RENAME TO read_product_tags_via_product;
ALTER POLICY admin_full_access_product_translations_v2 ON public.product_translations RENAME TO admin_full_access_product_translations;
ALTER POLICY read_product_translations_v2_via_product ON public.product_translations RENAME TO read_product_translations_via_product;
ALTER POLICY admin_full_access_products_v2 ON public.products RENAME TO admin_full_access_products;
ALTER POLICY read_products_v2 ON public.products RENAME TO read_products;
ALTER POLICY admin_full_access_refunds_v2 ON public.refunds RENAME TO admin_full_access_refunds;
ALTER POLICY customer_select_own_refunds_v2 ON public.refunds RENAME TO customer_select_own_refunds;
ALTER POLICY admin_full_access_schedule_slots_v2 ON public.schedule_slots RENAME TO admin_full_access_schedule_slots;
ALTER POLICY read_schedule_slots_v2_via_product ON public.schedule_slots RENAME TO read_schedule_slots_via_product;
ALTER POLICY admin_full_access_session_cancellations_v2 ON public.session_cancellations RENAME TO admin_full_access_session_cancellations;
ALTER POLICY customer_select_own_session_cancellations_v2 ON public.session_cancellations RENAME TO customer_select_own_session_cancellations;
ALTER POLICY admin_full_access_site_details_v2 ON public.site_details RENAME TO admin_full_access_site_details;
ALTER POLICY gedu_read_site_details_v2 ON public.site_details RENAME TO gedu_read_site_details;
ALTER POLICY admin_full_access_site_staff_details_v2 ON public.site_staff_details RENAME TO admin_full_access_site_staff_details;
ALTER POLICY gedu_read_site_staff_details_v2 ON public.site_staff_details RENAME TO gedu_read_site_staff_details;
ALTER POLICY admin_full_access_tag_translations_v2 ON public.tag_translations RENAME TO admin_full_access_tag_translations;
ALTER POLICY public_read_tag_translations_v2 ON public.tag_translations RENAME TO public_read_tag_translations;
ALTER POLICY admin_full_access_tags_v2 ON public.tags RENAME TO admin_full_access_tags;
ALTER POLICY public_read_tags_v2 ON public.tags RENAME TO public_read_tags;
ALTER POLICY admin_full_access_topic_translations_v2 ON public.topic_translations RENAME TO admin_full_access_topic_translations;
ALTER POLICY public_read_topic_translations_v2 ON public.topic_translations RENAME TO public_read_topic_translations;
ALTER POLICY admin_full_access_topics_v2 ON public.topics RENAME TO admin_full_access_topics;
ALTER POLICY public_read_topics_v2 ON public.topics RENAME TO public_read_topics;

-- 8. Function renames + body rewrites
-- (get_product_groups_v2_with_details carries `_v2` mid-name, not as a suffix,
--  so the generator missed its rename; do it explicitly. The generated
--  CREATE OR REPLACE further below rewrites its body to canonical names.)
ALTER FUNCTION public.get_product_groups_v2_with_details(uuid) RENAME TO get_product_groups_with_details;
ALTER FUNCTION public.apply_credit_motion_v2(p_participation_id uuid, p_session_date date, p_delta integer, p_reason text) RENAME TO apply_credit_motion;
CREATE OR REPLACE FUNCTION public.apply_credit_motion(p_participation_id uuid, p_session_date date, p_delta integer, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_gamer_id    UUID;
  v_product_id  UUID;
  v_balance     INTEGER;
  v_inserted    INTEGER := 0;
BEGIN
  IF p_delta NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'invalid delta: %', p_delta USING ERRCODE = 'check_violation';
  END IF;

  SELECT gamer_id, product_id, credits_remaining
    INTO v_gamer_id, v_product_id, v_balance
    FROM public.participations
    WHERE id = p_participation_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF p_delta = -1 AND v_balance <= 0 THEN
    INSERT INTO public.credit_deductions (
      participation_id, gamer_id, product_id, session_date, delta, reason
    ) VALUES (
      p_participation_id, v_gamer_id, v_product_id, p_session_date, 0,
      p_reason || '_underflow_skipped'
    )
    ON CONFLICT (participation_id, session_date) DO NOTHING;
    RETURN FALSE;
  END IF;

  INSERT INTO public.credit_deductions (
    participation_id, gamer_id, product_id, session_date, delta, reason
  ) VALUES (
    p_participation_id, v_gamer_id, v_product_id, p_session_date, p_delta, p_reason
  )
  ON CONFLICT (participation_id, session_date) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN FALSE;
  END IF;

  IF p_delta <> 0 THEN
    UPDATE public.participations
       SET credits_remaining = credits_remaining + p_delta
     WHERE id = p_participation_id;
  END IF;

  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_read_product(p_product_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- admin sees everything (mirrors admin_full_access_* FOR ALL)
    (SELECT get_user_role()) = 'admin'
    -- public: published and visible
    OR EXISTS (
      SELECT 1 FROM products pr
      WHERE pr.id = p_product_id
        AND pr.status IN ('pending', 'running')
        AND pr.is_visible = true
    )
    -- enrolled gamer (child's own login) OR purchaser (parent), active/waitlisted
    OR EXISTS (
      SELECT 1 FROM participations p
      WHERE p.product_id = p_product_id
        AND (p.gamer_id = (SELECT auth.uid()) OR p.customer_id = (SELECT auth.uid()))
        AND p.status IN ('active', 'waitlisted')
    )
    -- assigned gedu
    OR EXISTS (
      SELECT 1 FROM gedu_group_assignments a
      WHERE a.product_id = p_product_id
        AND a.gedu_id = (SELECT auth.uid())
    );
$function$
;

ALTER FUNCTION public.cancel_participation_v2(p_participation_id uuid, p_reason text) RENAME TO cancel_participation;
CREATE OR REPLACE FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_product_id                  UUID;
  v_status                      public.participation_status;
  v_credits_remaining           INTEGER;
  v_stripe_subscription_item_id TEXT;
  v_family_subscription_id      UUID;
BEGIN
  SELECT product_id, status, credits_remaining
    INTO v_product_id, v_status, v_credits_remaining
    FROM public.participations
    WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Pull linked Stripe item before delete (CASCADE removes the row).
  SELECT stripe_subscription_item_id, family_subscription_id
    INTO v_stripe_subscription_item_id, v_family_subscription_id
    FROM public.family_subscription_items
    WHERE participation_id = p_participation_id
    LIMIT 1;

  DELETE FROM public.participations WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'cancelled',
    'product_id', v_product_id,
    'previous_status', v_status::text,
    'forfeited_credits', v_credits_remaining,
    'stripe_subscription_item_id', v_stripe_subscription_item_id,
    'family_subscription_id', v_family_subscription_id,
    'reason', p_reason
  );
END;
$function$
;

ALTER FUNCTION public.commit_group_changes_v2(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb) RENAME TO commit_group_changes;
CREATE OR REPLACE FUNCTION public.commit_group_changes(p_product_id uuid, p_added_groups jsonb DEFAULT '[]'::jsonb, p_renamed_groups jsonb DEFAULT '[]'::jsonb, p_deleted_group_ids uuid[] DEFAULT '{}'::uuid[], p_gedu_assignments_added jsonb DEFAULT '[]'::jsonb, p_gedu_assignments_removed jsonb DEFAULT '[]'::jsonb, p_participation_moves jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group           JSONB;
  v_assignment      JSONB;
  v_move            JSONB;
  v_new_id          UUID;
  v_real_to_id      UUID;
  v_resolved_group  UUID;
  v_gedu_id         UUID;
  v_gedu_id_text    TEXT;
  v_temp_map        JSONB := '{}'::jsonb;
BEGIN
  IF (SELECT get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- Removes first so an admin can move a Gedu from group A to B in one batch.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_removed) LOOP
    DELETE FROM gedu_group_assignments
     WHERE group_id = (v_assignment->>'groupId')::UUID
       AND gedu_id  = (v_assignment->>'geduId')::UUID;
  END LOOP;

  IF array_length(p_deleted_group_ids, 1) > 0 THEN
    DELETE FROM product_groups
     WHERE id = ANY(p_deleted_group_ids)
       AND product_id = p_product_id;
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_renamed_groups) LOOP
    UPDATE product_groups
       SET name = v_group->>'name'
     WHERE id = (v_group->>'groupId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups (product_id, name)
    VALUES (p_product_id, v_group->>'name')
    RETURNING id INTO v_new_id;

    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);

    IF jsonb_typeof(v_group->'geduIds') = 'array' THEN
      FOR v_gedu_id_text IN SELECT jsonb_array_elements_text(v_group->'geduIds') LOOP
        INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id)
        VALUES (v_new_id, v_gedu_id_text::UUID, p_product_id);
      END LOOP;
    END IF;
  END LOOP;

  -- Explicit conflict target so the (gedu_id, product_id) UNIQUE violation
  -- propagates as an error (an admin trying to assign the same Gedu to two
  -- groups in one product should fail). Only the (group_id, gedu_id)
  -- primary-key conflict — the caller redundantly listing a pair already
  -- covered by the inline gedus above — is silenced.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_added) LOOP
    IF v_temp_map ? (v_assignment->>'groupId') THEN
      v_resolved_group := (v_temp_map->>(v_assignment->>'groupId'))::UUID;
    ELSE
      v_resolved_group := (v_assignment->>'groupId')::UUID;
    END IF;

    v_gedu_id := (v_assignment->>'geduId')::UUID;

    INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id)
    VALUES (v_resolved_group, v_gedu_id, p_product_id)
    ON CONFLICT (group_id, gedu_id) DO NOTHING;
  END LOOP;

  FOR v_move IN SELECT * FROM jsonb_array_elements(p_participation_moves) LOOP
    IF (v_move->'toGroupId') IS NULL OR jsonb_typeof(v_move->'toGroupId') = 'null' THEN
      v_real_to_id := NULL;
    ELSIF v_temp_map ? (v_move->>'toGroupId') THEN
      v_real_to_id := (v_temp_map->>(v_move->>'toGroupId'))::UUID;
    ELSE
      v_real_to_id := (v_move->>'toGroupId')::UUID;
    END IF;

    UPDATE participations
       SET group_id = v_real_to_id
     WHERE id = (v_move->>'participationId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  RETURN jsonb_build_object('tempMap', v_temp_map);
END;
$function$
;

ALTER FUNCTION public.confirm_reservation_v2(p_reservation_id uuid, p_credits_to_grant integer) RENAME TO confirm_reservation;
CREATE OR REPLACE FUNCTION public.confirm_reservation(p_reservation_id uuid, p_credits_to_grant integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_product_id   UUID;
  v_gamer_id     UUID;
  v_customer_id  UUID;
  v_status       public.participation_status;
  v_conflict_id  UUID;
BEGIN
  SELECT product_id, gamer_id, customer_id, status
    INTO v_product_id, v_gamer_id, v_customer_id, v_status
    FROM public.participations
    WHERE id = p_reservation_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'orphan');
  END IF;

  -- Idempotent replay of the same reservation's webhook.
  IF v_status = 'active' THEN
    RETURN jsonb_build_object(
      'kind', 'confirmed',
      'participation_id', p_reservation_id,
      'product_id', v_product_id,
      'gamer_id', v_gamer_id,
      'customer_id', v_customer_id,
      'idempotent', TRUE
    );
  END IF;

  IF v_status <> 'reserving' THEN
    RETURN jsonb_build_object('kind', 'orphan');
  END IF;

  -- Pre-check the partial UNIQUE: is there another non-reserving row for
  -- this (product, gamer)? If so, the parent already has a confirmed seat
  -- (or waitlist position) from a different reservation, and this Stripe
  -- payment is a duplicate. Return early so the route layer can refund.
  SELECT id
    INTO v_conflict_id
    FROM public.participations
    WHERE product_id = v_product_id
      AND gamer_id   = v_gamer_id
      AND id        <> p_reservation_id
      AND status    IN ('active', 'waitlisted', 'completed')
    LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'kind', 'duplicate_payment',
      'reservation_id', p_reservation_id,
      'existing_participation_id', v_conflict_id,
      'product_id', v_product_id,
      'gamer_id', v_gamer_id,
      'customer_id', v_customer_id
    );
  END IF;

  UPDATE public.participations
     SET status = 'active',
         reserved_until = NULL,
         credits_remaining = p_credits_to_grant
   WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'kind', 'confirmed',
    'participation_id', p_reservation_id,
    'product_id', v_product_id,
    'gamer_id', v_gamer_id,
    'customer_id', v_customer_id,
    'idempotent', FALSE
  );
END;
$function$
;

ALTER FUNCTION public.count_active_seats_v2(p_product_id uuid) RENAME TO count_active_seats;
CREATE OR REPLACE FUNCTION public.count_active_seats(p_product_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COUNT(*)::INTEGER
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'active';
$function$
;

ALTER FUNCTION public.count_seats_taken_v2(p_product_id uuid) RENAME TO count_seats_taken;
CREATE OR REPLACE FUNCTION public.count_seats_taken(p_product_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COUNT(*)::INTEGER
    FROM public.participations
    WHERE product_id = p_product_id
      AND status IN ('active', 'reserving');
$function$
;

ALTER FUNCTION public.create_participation_v2(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text) RENAME TO create_participation;
CREATE OR REPLACE FUNCTION public.create_participation(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_product               public.products;
  v_eff_status            public.effective_product_status;
  v_seats_taken           INTEGER;
  v_existing_id           UUID;
  v_existing_status       public.participation_status;
  v_participation_id      UUID;
  v_reserved_until        TIMESTAMPTZ;
  v_is_parent             BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_gamer_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_eff_status := public.effective_status(p_product_id);
  IF v_eff_status NOT IN ('pending', 'running') THEN
    RAISE EXCEPTION 'product is not accepting signups (effective status: %)', v_eff_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_product.registration_opens_at IS NOT NULL
     AND v_product.registration_opens_at > NOW() THEN
    RAISE EXCEPTION 'registration has not yet opened'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_currency NOT IN ('eur', 'gbp', 'usd') THEN
    RAISE EXCEPTION 'unsupported currency: %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_purchase_shape NOT IN (
    'bundle_1', 'bundle_4', 'bundle_10',
    'subscription_monthly', 'subscription_quarterly', 'subscription_yearly',
    'single_payment', 'free'
  ) THEN
    RAISE EXCEPTION 'unsupported purchase shape: %', p_purchase_shape
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
      AND status IN ('active', 'waitlisted')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a % participation on this product', p_gamer_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Seat-count gate. Sits above the free branch so an explicit cap on a
  -- free product (the schema permits it) is honored — earlier versions
  -- only checked the cap on paid signups, so a free product with
  -- seat_count=20 silently accepted the 21st signup.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_seats_taken(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations (
      product_id, gamer_id, customer_id, status, credits_remaining
    ) VALUES (
      p_product_id, p_gamer_id, p_customer_id, 'active', 0
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'free_active',
      'participation_id', v_participation_id
    );
  END IF;

  v_reserved_until := NOW() + INTERVAL '30 minutes';
  INSERT INTO public.participations (
    product_id, gamer_id, customer_id, status, reserved_until, credits_remaining
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'reserving', v_reserved_until, 0
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'kind', 'reserving',
    'participation_id', v_participation_id,
    'reserved_until', v_reserved_until
  );
END;
$function$
;

ALTER FUNCTION public.create_product_v2(p_product_type product_type, p_billing_mode billing_mode, p_translations jsonb, p_topic_id uuid, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_tag_ids uuid[], p_prices jsonb, p_holiday_calendar_ids uuid[]) RENAME TO create_product;
CREATE OR REPLACE FUNCTION public.create_product(p_product_type product_type, p_billing_mode billing_mode, p_translations jsonb, p_topic_id uuid, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_status product_status DEFAULT 'draft'::product_status, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_image_path text DEFAULT NULL::text, p_padlet_url text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_refund_policy_days integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_product_id    UUID;
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
BEGIN
  IF (SELECT public.get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can create products'
      USING ERRCODE = '42501';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.products (
    product_type, billing_mode, topic_id,
    min_age, max_age, spoken_language_code, image_path, padlet_url,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    refund_policy_days, is_visible, created_by
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic_id,
    p_min_age, p_max_age, p_spoken_language_code, p_image_path, p_padlet_url,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_refund_policy_days, p_is_visible, auth.uid()
  )
  RETURNING id INTO v_product_id;

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, description
    )
    VALUES (
      v_product_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'description', '')
    );
  END LOOP;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        v_product_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.product_tags (product_id, tag_id)
    SELECT v_product_id, unnest(p_tag_ids);
  END IF;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_per_session, price_per_month
      )
      VALUES (
        v_product_id,
        v_price->>'currency',
        (v_price->>'price_per_session')::INTEGER,
        (v_price->>'price_per_month')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT v_product_id, unnest(p_holiday_calendar_ids);
  END IF;

  RETURN v_product_id;
END;
$function$
;

ALTER FUNCTION public.effective_status_v2(p_product_id uuid) RENAME TO effective_status;
CREATE OR REPLACE FUNCTION public.effective_status(p_product_id uuid)
 RETURNS effective_product_status
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_status            public.product_status;
  v_start_date        DATE;
  v_end_date          DATE;
  v_signup_threshold  INTEGER;
  v_timezone          TEXT;
  v_active_count      INTEGER;
  v_now_local         DATE;
  v_end_passed        BOOLEAN;
  v_has_date          BOOLEAN;
  v_has_threshold     BOOLEAN;
  v_start_reached     BOOLEAN;
  v_threshold_met     BOOLEAN;
  v_would_run         BOOLEAN;
BEGIN
  SELECT status, start_date, end_date, signup_threshold, timezone
    INTO v_status, v_start_date, v_end_date, v_signup_threshold, v_timezone
    FROM public.products
    WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status = 'draft' THEN     RETURN 'draft'; END IF;
  IF v_status = 'cancelled' THEN RETURN 'cancelled'; END IF;
  IF v_status = 'completed' THEN RETURN 'completed'; END IF;

  v_now_local := (NOW() AT TIME ZONE v_timezone)::DATE;
  v_end_passed := v_end_date IS NOT NULL AND v_end_date < v_now_local;

  IF v_status = 'running' THEN
    RETURN CASE WHEN v_end_passed THEN 'completed' ELSE 'running' END;
  END IF;

  -- v_status = 'pending'
  v_has_date := v_start_date IS NOT NULL;
  v_has_threshold := v_signup_threshold IS NOT NULL;
  v_start_reached := NOT v_has_date OR v_start_date <= v_now_local;

  IF v_has_threshold THEN
    SELECT COUNT(*) INTO v_active_count
      FROM public.participations
      WHERE product_id = p_product_id AND status = 'active';
    v_threshold_met := v_active_count >= v_signup_threshold;
  ELSE
    v_threshold_met := TRUE;
  END IF;

  v_would_run := (v_has_date OR v_has_threshold) AND v_start_reached AND v_threshold_met;

  IF v_would_run THEN
    RETURN CASE WHEN v_end_passed THEN 'completed' ELSE 'running' END;
  END IF;

  RETURN CASE WHEN v_end_passed THEN 'expired' ELSE 'pending' END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_product_keeps_at_least_one_translation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- Allowed if at least one OTHER row will remain after this delete.
  IF EXISTS (
    SELECT 1 FROM public.product_translations
    WHERE product_id = OLD.product_id
      AND locale <> OLD.locale
  ) THEN
    RETURN OLD;
  END IF;

  -- The product itself is being deleted — CASCADE delete is fine.
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = OLD.product_id
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Each product must keep at least one translation'
    USING ERRCODE = 'check_violation';
END;
$function$
;

ALTER FUNCTION public.expire_reservation_v2(p_reservation_id uuid) RENAME TO expire_reservation;
CREATE OR REPLACE FUNCTION public.expire_reservation(p_reservation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_product_id UUID;
  v_status     public.participation_status;
BEGIN
  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations WHERE id = p_reservation_id;

  IF NOT FOUND OR v_status <> 'reserving' THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  DELETE FROM public.participations WHERE id = p_reservation_id AND status = 'reserving';

  RETURN jsonb_build_object('kind', 'expired');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_gedu_assigned_product(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id   UUID := (SELECT auth.uid());
  v_my_group_id UUID;
  v_product     JSONB;
  v_groups      JSONB;
BEGIN
  IF (SELECT get_user_role()) <> 'gedu' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT group_id
    INTO v_my_group_id
    FROM gedu_group_assignments
   WHERE product_id = p_product_id
     AND gedu_id    = v_caller_id
   LIMIT 1;

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'padlet_url',   p.padlet_url,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM products p
  WHERE p.id = p_product_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'is_my_group',   (pg.id = v_my_group_id),
        'gamer_count',   (
          SELECT COUNT(*)::INTEGER
            FROM participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'
        ),
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name
                   )
                   ORDER BY gp.first_name
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster',
          CASE WHEN pg.id = v_my_group_id THEN
            COALESCE((
              SELECT jsonb_agg(
                       jsonb_build_object(
                         'gamer_id',           part.gamer_id,
                         'first_name',         gmp.first_name,
                         'date_of_birth',      gprof.date_of_birth,
                         'gender',             gprof.gender,
                         'minecraft_username', mca.minecraft_username,
                         'minecraft_uuid',     mca.minecraft_uuid,
                         'parent_email',       (
                           SELECT pp.email
                             FROM parent_gamer pgm
                             JOIN profiles pp ON pp.id = pgm.parent_id
                            WHERE pgm.gamer_id = part.gamer_id
                            ORDER BY pgm.created_at ASC NULLS LAST,
                                     pgm.id           ASC
                            LIMIT 1
                         )
                       )
                       ORDER BY gmp.first_name
                     )
                FROM participations part
                JOIN profiles gmp              ON gmp.id        = part.gamer_id
                LEFT JOIN gamer_profiles gprof  ON gprof.user_id = part.gamer_id
                LEFT JOIN minecraft_accounts mca ON mca.user_id  = part.gamer_id
               WHERE part.group_id = pg.id
                 AND part.status   = 'active'
            ), '[]'::jsonb)
          ELSE NULL
          END
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_assigned_products()
 RETURNS TABLE(product_id uuid, group_id uuid, timezone text, start_date date, end_date date, padlet_url text, is_remote boolean, product_type product_type, product_translations jsonb, schedule_slots jsonb, group_count integer, gamer_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gedu_id UUID := (SELECT auth.uid());
BEGIN
  IF (SELECT get_user_role()) <> 'gedu' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id            AS product_id,
    a.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.padlet_url    AS padlet_url,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS gamer_count
  FROM gedu_group_assignments a
  JOIN products p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_product_groups_with_details(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
BEGIN
  IF (SELECT get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'created_at', g->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email
                   )
                   ORDER BY gp.first_name
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                       p.id,
                     'gamer_id',                 p.gamer_id,
                     'gamer_first_name',         gmp.first_name,
                     'gamer_date_of_birth',      gprof.date_of_birth,
                     'gamer_gender',             gprof.gender,
                     'gamer_minecraft_username', mca.minecraft_username,
                     'gamer_minecraft_uuid',     mca.minecraft_uuid,
                     'gamer_parent_first_name',  parent.first_name,
                     'gamer_parent_last_name',   parent.last_name,
                     'status',                   p.status,
                     'signed_up_at',             p.signed_up_at
                   )
                   ORDER BY gmp.first_name
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.gamer_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.gamer_id
               ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
               LIMIT 1
            ) parent ON true
           WHERE p.group_id = pg.id
             AND p.status = 'active'
        ), '[]'::jsonb)
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                       p.id,
             'gamer_id',                 p.gamer_id,
             'gamer_first_name',         gmp.first_name,
             'gamer_date_of_birth',      gprof.date_of_birth,
             'gamer_gender',             gprof.gender,
             'gamer_minecraft_username', mca.minecraft_username,
             'gamer_minecraft_uuid',     mca.minecraft_uuid,
             'gamer_parent_first_name',  parent.first_name,
             'gamer_parent_last_name',   parent.last_name,
             'status',                   p.status,
             'signed_up_at',             p.signed_up_at
           )
           ORDER BY p.signed_up_at
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.gamer_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.gamer_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.group_id IS NULL
     AND p.status = 'active';

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned
  );
END;
$function$
;

ALTER FUNCTION public.join_waitlist_v2(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid) RENAME TO join_waitlist;
CREATE OR REPLACE FUNCTION public.join_waitlist(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_product           public.products;
  v_existing_id       UUID;
  v_existing_pos      INTEGER;
  v_existing_status   public.participation_status;
  v_next_position     INTEGER;
  v_participation_id  UUID;
  v_is_parent         BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.parent_gamer
    WHERE parent_id = p_customer_id AND gamer_id = p_gamer_id
  ) INTO v_is_parent;
  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_gamer_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_product.waitlist_enabled THEN
    RAISE EXCEPTION 'waitlist is not enabled for this product'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency: existing waitlisted/reserving/active row → return it as-is.
  SELECT id, waitlist_position, status
    INTO v_existing_id, v_existing_pos, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND gamer_id = p_gamer_id
      AND status IN ('waitlisted', 'reserving', 'active')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'participation_id', v_existing_id,
      'waitlist_position', v_existing_pos,
      'status', v_existing_status::text
    );
  END IF;

  -- Compute next waitlist position.
  SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted';

  INSERT INTO public.participations (
    product_id, gamer_id, customer_id, status, waitlist_position, credits_remaining
  ) VALUES (
    p_product_id, p_gamer_id, p_customer_id, 'waitlisted', v_next_position, 0
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_next_position,
    'status', 'waitlisted'
  );
END;
$function$
;

ALTER FUNCTION public.participation_state_v2(p_status participation_status, p_group_id uuid) RENAME TO participation_state;
CREATE OR REPLACE FUNCTION public.participation_state(p_status participation_status, p_group_id uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_status = 'waitlisted' THEN 'waitlisted'
    WHEN p_group_id IS NULL      THEN 'unassigned'
    ELSE 'assigned'
  END;
$function$
;

ALTER FUNCTION public.process_session_credits_v2() RENAME TO process_session_credits;
CREATE OR REPLACE FUNCTION public.process_session_credits()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_processed INTEGER := 0;
  v_granted   INTEGER := 0;
  v_deducted  INTEGER := 0;
  v_errors    INTEGER := 0;
  v_rec       RECORD;
  v_session_start  TIMESTAMPTZ;
  v_session_date   DATE;
  v_was_cancelled  BOOLEAN;
  v_cancelled_in_window BOOLEAN;
  v_charge_window_hours CONSTANT INTEGER := 24;
  v_is_sub_covered BOOLEAN;
  v_applied        BOOLEAN;
  v_window_start   TIMESTAMPTZ;
  v_window_end     TIMESTAMPTZ;
BEGIN
  v_window_start := NOW() - INTERVAL '1 hour';
  v_window_end   := NOW();

  FOR v_rec IN
    SELECT
      pa.id           AS participation_id,
      pa.product_id,
      pa.gamer_id,
      p.timezone,
      ss.weekday,
      ss.start_time
      FROM public.participations pa
      JOIN public.products p ON p.id = pa.product_id
      JOIN public.schedule_slots ss ON ss.product_id = p.id
      WHERE pa.status = 'active'
        AND p.product_type = 'consumer_club'
        AND p.billing_mode = 'paid'
  LOOP
    BEGIN
      DECLARE
        v_now_local        TIMESTAMP;
        v_today_local      DATE;
        v_today_dow        INTEGER;
        v_days_back        INTEGER;
        v_candidate_date   DATE;
        v_candidate_ts     TIMESTAMPTZ;
      BEGIN
        v_now_local   := NOW() AT TIME ZONE v_rec.timezone;
        v_today_local := v_now_local::DATE;
        v_today_dow   := EXTRACT(ISODOW FROM v_now_local)::INTEGER - 1;

        v_days_back := (v_today_dow - v_rec.weekday + 7) % 7;
        v_candidate_date := v_today_local - v_days_back;
        v_candidate_ts := (v_candidate_date + v_rec.start_time) AT TIME ZONE v_rec.timezone;

        IF v_candidate_ts > NOW() THEN
          v_candidate_date := v_candidate_date - 7;
          v_candidate_ts := (v_candidate_date + v_rec.start_time) AT TIME ZONE v_rec.timezone;
        END IF;

        v_session_start := v_candidate_ts;
        v_session_date  := v_candidate_date;
      END;

      IF v_session_start < v_window_start OR v_session_start > v_window_end THEN
        CONTINUE;
      END IF;

      IF NOT public.product_has_session(v_rec.product_id, v_session_date) THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.credit_deductions
        WHERE participation_id = v_rec.participation_id
          AND session_date = v_session_date
      ) THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.session_cancellations
        WHERE participation_id = v_rec.participation_id
          AND session_date = v_session_date
          AND cancelled_at <= v_session_start - (v_charge_window_hours || ' hours')::INTERVAL
      ) INTO v_cancelled_in_window;

      SELECT EXISTS (
        SELECT 1 FROM public.session_cancellations
        WHERE participation_id = v_rec.participation_id
          AND session_date = v_session_date
      ) INTO v_was_cancelled;

      SELECT EXISTS (
        SELECT 1 FROM public.family_subscription_items i
        JOIN public.family_subscriptions fs ON fs.id = i.family_subscription_id
        WHERE i.participation_id = v_rec.participation_id
          AND fs.status IN ('active', 'past_due', 'canceling')
      ) INTO v_is_sub_covered;

      -- Branch order matters: sub-covered cases first (always 0 or +1 motion),
      -- then bundle cases (-1 for attended/late-cancel, 0 for in-window cancel).
      IF v_is_sub_covered AND v_cancelled_in_window THEN
        v_applied := public.apply_credit_motion(
          v_rec.participation_id, v_session_date, 1, 'sub_cancel_credit'
        );
        IF v_applied THEN v_granted := v_granted + 1; v_processed := v_processed + 1; END IF;
      ELSIF v_is_sub_covered THEN
        v_applied := public.apply_credit_motion(
          v_rec.participation_id, v_session_date, 0, 'sub_covered'
        );
        IF v_applied THEN v_processed := v_processed + 1; END IF;
      ELSIF v_cancelled_in_window THEN
        -- v_cancelled_in_window already implies v_was_cancelled, so the
        -- `AND v_was_cancelled` we used to have was dead code. Bundle +
        -- cancelled-on-time = no charge.
        v_applied := public.apply_credit_motion(
          v_rec.participation_id, v_session_date, 0, 'bundle_cancel_no_charge'
        );
        IF v_applied THEN v_processed := v_processed + 1; END IF;
      ELSIF v_was_cancelled THEN
        -- Cancellation row exists but past the 24h window — still charge.
        -- Distinct reason from a no-show so the audit trail captures the
        -- actual decision (parent disputing a charge can see the cancel
        -- happened but landed too late).
        v_applied := public.apply_credit_motion(
          v_rec.participation_id, v_session_date, -1, 'bundle_late_cancel_charged'
        );
        IF v_applied THEN v_deducted := v_deducted + 1; v_processed := v_processed + 1; END IF;
      ELSE
        v_applied := public.apply_credit_motion(
          v_rec.participation_id, v_session_date, -1, 'bundle_attended_or_no_show'
        );
        IF v_applied THEN v_deducted := v_deducted + 1; v_processed := v_processed + 1; END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'process_session_credits failed for participation %: %',
        v_rec.participation_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'granted',   v_granted,
    'deducted',  v_deducted,
    'errors',    v_errors,
    'processed_at', NOW()
  );
END;
$function$
;

ALTER FUNCTION public.product_has_session_v2(p_product_id uuid, p_session_date date) RENAME TO product_has_session;
CREATE OR REPLACE FUNCTION public.product_has_session(p_product_id uuid, p_session_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH p AS (
    SELECT timezone FROM public.products WHERE id = p_product_id
  )
  SELECT
    EXISTS (
      SELECT 1 FROM public.schedule_slots s
      WHERE s.product_id = p_product_id
        AND s.weekday = (EXTRACT(ISODOW FROM p_session_date)::INTEGER - 1)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_holiday_calendars phc
      JOIN public.calendar_holidays ch ON ch.calendar_id = phc.calendar_id
      WHERE phc.product_id = p_product_id
        AND ch.date = p_session_date
    );
$function$
;

ALTER FUNCTION public.promote_from_waitlist_v2(p_product_id uuid) RENAME TO promote_from_waitlist;
CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id           UUID;
  v_gamer_id     UUID;
  v_customer_id  UUID;
  v_position     INTEGER;
BEGIN
  -- Caller is expected to hold the gate lock; we don't re-take it.
  SELECT id, gamer_id, customer_id, waitlist_position
    INTO v_id, v_gamer_id, v_customer_id, v_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted'
    ORDER BY waitlist_position ASC
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'empty_waitlist');
  END IF;

  RETURN jsonb_build_object(
    'kind', 'promoted',
    'participation_id', v_id,
    'gamer_id', v_gamer_id,
    'customer_id', v_customer_id,
    'waitlist_position', v_position
  );
END;
$function$
;

ALTER FUNCTION public.refresh_product_seat_counts_v2(p_product_id uuid) RENAME TO refresh_product_seat_counts;
CREATE OR REPLACE FUNCTION public.refresh_product_seat_counts(p_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_active     INTEGER;
  v_reserving  INTEGER;
  v_waitlist   INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'active'),
    COUNT(*) FILTER (WHERE status = 'reserving' AND reserved_until > NOW()),
    COUNT(*) FILTER (WHERE status = 'waitlisted')
    INTO v_active, v_reserving, v_waitlist
    FROM public.participations
    WHERE product_id = p_product_id;

  INSERT INTO public.product_seat_counts (
    product_id, active_count, reserving_count, waitlist_count, updated_at
  )
  VALUES (p_product_id, v_active, v_reserving, v_waitlist, NOW())
  ON CONFLICT (product_id) DO UPDATE SET
    active_count    = EXCLUDED.active_count,
    reserving_count = EXCLUDED.reserving_count,
    waitlist_count  = EXCLUDED.waitlist_count,
    updated_at      = EXCLUDED.updated_at;
END;
$function$
;

ALTER FUNCTION public.trg_refresh_product_seat_counts_v2() RENAME TO trg_refresh_product_seat_counts;
CREATE OR REPLACE FUNCTION public.trg_refresh_product_seat_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_product_seat_counts(OLD.product_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_product_seat_counts(NEW.product_id);

  -- An UPDATE that moved a row to a different product needs the old product
  -- recomputed too (theoretical — product_id doesn't change in practice,
  -- but the trigger covers it anyway).
  IF TG_OP = 'UPDATE' AND OLD.product_id <> NEW.product_id THEN
    PERFORM public.refresh_product_seat_counts(OLD.product_id);
  END IF;

  RETURN NEW;
END;
$function$
;

ALTER FUNCTION public.trg_seed_product_seat_counts_v2() RENAME TO trg_seed_product_seat_counts;
CREATE OR REPLACE FUNCTION public.trg_seed_product_seat_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.product_seat_counts (
    product_id, active_count, reserving_count, waitlist_count
  ) VALUES (NEW.id, 0, 0, 0)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

ALTER FUNCTION public.update_product_v2(p_id uuid, p_billing_mode billing_mode, p_translations jsonb, p_topic_id uuid, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean, p_waitlist_enabled boolean, p_image_path text, p_padlet_url text, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_refund_policy_days integer, p_schedule_slots jsonb, p_tag_ids uuid[], p_prices jsonb, p_holiday_calendar_ids uuid[]) RENAME TO update_product;
CREATE OR REPLACE FUNCTION public.update_product(p_id uuid, p_billing_mode billing_mode, p_translations jsonb, p_topic_id uuid, p_min_age integer, p_max_age integer, p_spoken_language_code text, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_image_path text DEFAULT NULL::text, p_padlet_url text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_refund_policy_days integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_locales       TEXT[];
BEGIN
  IF (SELECT public.get_user_role()) <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can update products'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_id) THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Parent row update. status / product_type / created_by / created_at
  -- are deliberately untouched. updated_at flips via the existing trigger.
  UPDATE public.products SET
    billing_mode          = p_billing_mode,
    topic_id              = p_topic_id,
    min_age               = p_min_age,
    max_age               = p_max_age,
    spoken_language_code  = p_spoken_language_code,
    image_path            = p_image_path,
    padlet_url            = p_padlet_url,
    location_id           = p_location_id,
    is_remote             = p_is_remote,
    signup_threshold      = p_signup_threshold,
    start_date            = p_start_date,
    end_date              = p_end_date,
    timezone              = p_timezone,
    seat_count            = p_seat_count,
    waitlist_enabled      = p_waitlist_enabled,
    registration_opens_at = p_registration_opens_at,
    refund_policy_days    = p_refund_policy_days,
    is_visible            = p_is_visible
  WHERE id = p_id;

  -- ============================================================
  -- product_translations — UPSERT new set, then DELETE leftovers.
  -- The trigger guards "≥1 row remains"; the upsert puts the new rows
  -- in place before any delete fires, so leftover deletes never trip
  -- the check.
  -- ============================================================

  v_locales := ARRAY[]::TEXT[];

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, description
    )
    VALUES (
      p_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'description', '')
    )
    ON CONFLICT (product_id, locale) DO UPDATE SET
      name        = EXCLUDED.name,
      description = EXCLUDED.description,
      updated_at  = NOW();

    v_locales := array_append(v_locales, v_translation->>'locale');
  END LOOP;

  DELETE FROM public.product_translations
  WHERE product_id = p_id
    AND locale <> ALL (v_locales);

  -- ============================================================
  -- schedule_slots — wipe and replace.
  -- ============================================================

  DELETE FROM public.schedule_slots WHERE product_id = p_id;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        p_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  -- ============================================================
  -- product_tags — wipe and replace.
  -- ============================================================

  DELETE FROM public.product_tags WHERE product_id = p_id;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.product_tags (product_id, tag_id)
    SELECT p_id, unnest(p_tag_ids);
  END IF;

  -- ============================================================
  -- product_prices — wipe and replace.
  -- ============================================================

  DELETE FROM public.product_prices WHERE product_id = p_id;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_per_session, price_per_month
      )
      VALUES (
        p_id,
        v_price->>'currency',
        (v_price->>'price_per_session')::INTEGER,
        (v_price->>'price_per_month')::INTEGER
      );
    END LOOP;
  END IF;

  -- ============================================================
  -- product_holiday_calendars — wipe and replace.
  -- ============================================================

  DELETE FROM public.product_holiday_calendars WHERE product_id = p_id;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT p_id, unnest(p_holiday_calendar_ids);
  END IF;

  RETURN p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_gedu_assignment_product()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_group_product_id UUID;
BEGIN
  SELECT product_id INTO v_group_product_id
    FROM public.product_groups
    WHERE id = NEW.group_id;

  IF v_group_product_id IS NULL THEN
    RAISE EXCEPTION 'group_id % does not exist', NEW.group_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.product_id IS NULL THEN
    NEW.product_id := v_group_product_id;
  ELSIF NEW.product_id <> v_group_product_id THEN
    RAISE EXCEPTION 'gedu_group_assignments.product_id % does not match group %''s product_id %',
      NEW.product_id, NEW.group_id, v_group_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_participations_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_group_product_id UUID;
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT product_id INTO v_group_product_id
    FROM public.product_groups
    WHERE id = NEW.group_id;

  IF v_group_product_id IS NULL THEN
    RAISE EXCEPTION 'group_id % does not exist', NEW.group_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_group_product_id <> NEW.product_id THEN
    RAISE EXCEPTION 'group_id % belongs to a different product', NEW.group_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_products_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  loc_type public.location_type;
BEGIN
  IF NEW.location_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT type INTO loc_type FROM public.locations WHERE id = NEW.location_id;
  IF loc_type IS NULL THEN
    RAISE EXCEPTION 'location_id % does not exist', NEW.location_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.is_remote = false THEN
    IF loc_type <> 'site' THEN
      RAISE EXCEPTION 'In-person product location must be a site (got %)', loc_type
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.product_type = 'municipality_club' THEN
    IF loc_type NOT IN ('country', 'region', 'municipality') THEN
      RAISE EXCEPTION 'Online municipality club location must be country/region/municipality (got %)', loc_type
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

