# SOGA Feature Gap Analysis

Features and capabilities present in the legacy SOGA platform (Gamers' Arena) that are **not present in Sogverse** and **not replaced by a Sogverse equivalent**. Each item is rated for business priority and estimated technical complexity if rebuilt for Sogverse using its modern stack (Next.js 16, Supabase, Stripe, TypeScript).

**Priority labels:** `Critical` | `High` | `Medium` | `Low`
**Complexity labels:** `Low` | `Medium` | `High` | `Very High`

---

## Geographic Hierarchy

### 2. Custom Fields System

**Description:** Dynamic custom fields that can be attached at the Country, Municipality, School, or Club level. Fields are defined by admins and rendered dynamically in registration and admin forms. Supports text inputs and select dropdowns. Answers are stored as JSON metadata on participant records.

**Priority:** `Medium`
**Complexity:** `Medium` — A `custom_fields` table with a polymorphic association (entity type + entity ID), a JSON answers column on enrollments/registrations, and dynamic form rendering components. Needs a small admin UI for field definition.

---

## Registration & Onboarding

### 3. Public Municipality Registration Wizard

**Description:** A public-facing 4-step registration form (no login required) where parents register children into municipality-funded clubs. Steps: select country/municipality/school/club (cascading dropdowns) > enter parent + child info > answer custom fields > confirmation. Handles waiting list overflow automatically when clubs are full. Sends Finnish-language confirmation or waiting-list emails. Creates parent and gamer user accounts as a side effect.

**Priority:** `Critical`
**Complexity:** `High` — Multi-step public form with cascading data fetching, input validation (phone, email, birthdate), waiting list logic, automatic user account creation, email notifications, and custom field rendering. Requires a public API that bypasses auth.

---

## Lessons & Attendance

### 5. Lesson Scheduling & Management

**Description:** Individual lesson instances are created within club groups, each with a date, time, status code, notes, and optional assignment codes. Lessons can be created one-by-one or batch-created for an entire club period (e.g., generate all lessons for a semester). Lessons have their own status workflow and can track substitutions when a different educator covers a session.

**Priority:** `High`
**Complexity:** `High` — A `lessons` table linked to groups, batch creation logic (generate lessons from meeting times + date range), per-lesson CRUD, status code management, substitution tracking, and a calendar/list UI for educators. This is a substantial feature with its own data model.

---

### 6. Lesson Attendance Tracking

**Description:** Per-participant attendance entries for each lesson. Educators mark each gamer as present, absent, or other status codes per lesson. Attendance data feeds into invoicing calculations and reporting. The UI shows a participant list per lesson with status dropdowns.

**Priority:** `High`
**Complexity:** `Medium` — A `lesson_entries` junction table (lesson + participant + status), a UI for marking attendance per lesson, and queries for attendance aggregation. Depends on lesson management (item 5).

---

### 7. Lesson Rewards

**Description:** Lessons can have reward codes with amounts attached. When a lesson is completed, rewards are distributed to participants. Rewards use the code domain system for reward types (e.g., attribute points for the achievement/level system).

**Priority:** `Medium`
**Complexity:** `Low` — A `lesson_rewards` table and distribution logic, but tightly coupled to the achievement system (item 12). Simple if achievements exist; less useful standalone.

---

## Educator (GEDU) Management

### 8. GEDU Profile System

**Description:** Detailed educator profiles beyond basic user info. Tracks languages spoken, geographic locations/municipalities served, qualifications (certifications), skills/content types, attendance types (in-person, remote), and a separate invoicing email. All attributes are managed via the code domain system and have dedicated admin UI with add/remove operations.

**Priority:** `High`
**Complexity:** `Medium` — A `gedu_profiles` extension table plus several junction tables (gedu_languages, gedu_locations, gedu_qualifications, gedu_skills). Admin UI for managing these attributes. Sogverse already has a `gamer_profiles` extension pattern to follow.

---

### 9. Substitute Educator Search

**Description:** Advanced search tool for finding substitute educators. Filters by weekday, time window, languages, qualifications, skills/content types, attendance types, and locations/municipalities. Returns educators available for a specific time slot. Used when a regular educator can't cover a session.

**Priority:** `Medium`
**Complexity:** `Medium` — A search API that queries across GEDU profile junction tables with AND/OR filtering. Depends on GEDU profiles (item 8) existing first. The multi-filter UI uses react-select multi-selects.

---

### 10. Criminal Record Check Tracking

**Description:** Records whether an educator has completed a criminal record check, stored as metadata on the user record. Required for working with children in Finland.

**Priority:** `High`
**Complexity:** `Low` — A date/status field on the GEDU profile. Minimal UI (a date picker + status indicator on the user detail page).

---

## Invoicing & Financial Reporting

### 11. GEDU Invoicing System

**Description:** Period-based invoicing for educators. Invoicing periods are created monthly (or custom ranges). Each lesson generates invoicing line items linked to a GEDU, club, and pricing tier. Line items have a status workflow: Unhandled > Processed/Rejected > Invoiced. Educators can view their own invoicing data; admins manage statuses. The UI includes period selection, line item tables, amount summaries, and status controls.

**Priority:** `Critical`
**Complexity:** `Very High` — Multiple tables (invoicing periods, invoicing lines, club pricing), a status state machine, business rules for line generation from lessons, period management, role-based views (GEDU sees own data, admin sees all), and financial reporting UI. This is one of the most complex SOGA features.

---

### 12. Municipality Invoicing

**Description:** Separate invoicing track for billing municipalities. Tracks invoicing data per municipality with contact info, invoicing metadata, and per-lesson line items. Admins can set invoicing status per municipality and generate reports filtered by country, municipality, date range, year, and educator.

**Priority:** `Critical`
**Complexity:** `High` — A `muni_invoicing` table linked to lessons and municipalities, invoicing status management, and admin reporting UI with multi-dimensional filtering. Depends on geographic hierarchy (item 1) and lesson management (item 5).

---

### 13. Reporting Suite

**Description:** Four distinct report views for financial and operational data:

- **Municipality Invoicing Report** — Filter by country, municipality, date range, year, GEDU. Shows invoicing lines with clubs, participants, amounts, and statuses.
- **Municipality Summary Report** — Aggregated financial summaries across municipalities for a given period.
- **Truster Report** — Payment gateway data per GEDU per period, with CSV and JSON export.
- **GEDU Invoicing Status Report** — Overview of all invoicing periods with status indicators, date ranges, and amounts.

**Priority:** `High`
**Complexity:** `High` — Complex SQL queries with multi-table joins, date-range filtering, aggregation, role-based data scoping, and export functionality (CSV/JSON). Each report is a distinct page with its own filter controls and data tables. Depends on invoicing systems (items 11, 12).

---

## Gamification & Engagement

### 14. Achievement System

**Description:** A full achievement/progression system. Achievements have complex unlock conditions defined with a regex-based DSL supporting variable comparisons (>, >=, ==), AND/OR logic, and manual unlocks (by GEDU or parent). Each achievement has multi-language translations (EN, FI, ES), image, and reward items. Gamers have four attribute scores (Harmony, Glow, Valor, Common Sense) that accumulate from rewards. A level is derived from the square root of each attribute score.

The gamer profile UI shows:
- Total level with progress bar
- Four attribute levels with individual progress bars
- A 4-axis radar chart visualization
- Achievement grid with progress bars and unlock status
- Modal notifications for new unlocks with carousel navigation

**Priority:** `Medium`
**Complexity:** `Very High` — Achievement definitions table with translations, reward items, unlock condition parser/evaluator, four attribute scores on gamer profiles, level calculation logic, progress tracking, radar chart component, achievement grid UI, and notification system. The condition evaluation engine is the hardest part.

---

### 15. Gamers Gym / Activity Generator

**Description:** A database of activities (name, description, image) that educators can use during sessions. The activity generator is a carousel/slot-machine UI that spins through activities and lands on a random one — used to pick icebreaker or warm-up activities during club sessions. Admins manage the activity library via a data grid.

**Priority:** `Low`
**Complexity:** `Low` — An `activities` table with CRUD, and a fun carousel component with animation. Small, self-contained feature.

---

## Configuration & Data Management

### 16. Code / Code Domain System

**Description:** A system-wide configurable enumeration framework. Code domains are categories (e.g., CLUB_STATUS, LESSON_STATUS, GENDER, GROUP_TYPE, CURRENCY). Each domain contains ordered codes with name and index. Used throughout the app for dropdown values, status fields, type classifications, and filter options. Admins can create, edit, reorder, and delete codes and domains.

**Priority:** `Medium`
**Complexity:** `Medium` — Two tables (`code_domains`, `codes`) with a parent-child relationship, admin CRUD UI, and a pattern for referencing codes from other models. Sogverse currently hardcodes enums in TypeScript and PostgreSQL; this system makes them admin-configurable at runtime. The value depends on whether runtime configurability is needed vs. compile-time enums.

---

### 17. Club Instructions

**Description:** Configurable instruction documents attached to clubs, categorized by type (via code domain). Admins create and manage instructions that can be associated with clubs. Used to provide standardized guidelines for educators running specific types of sessions.

**Priority:** `Low`
**Complexity:** `Low` — A `club_instructions` table with name and type, a many-to-many with clubs/products, and a simple admin data grid.

---

### 18. Club Pricing Configuration

**Description:** Per-club pricing with currency support. Each club can have pricing tiers defined with amount and currency code. Used in invoicing calculations to determine line item amounts. Separate from subscription pricing — this is the operational cost/rate for running a club.

**Priority:** `High`
**Complexity:** `Low` — A `club_pricing` table linked to products/clubs with amount and currency fields. The data model is simple; the complexity is in how it integrates with invoicing (item 11).

---

### 19. Entities Management

**Description:** Business entity records (organizations, companies) that can be associated with clubs. Entities have basic info and club relationships. Used for tracking which organization operates or sponsors a club.

**Priority:** `Low`
**Complexity:** `Low` — An `entities` table with CRUD and a junction table to products. Simple admin UI.

---

## Communication & CRM

### 20. ActiveCampaign CRM Integration

**Description:** Bi-directional integration with ActiveCampaign for marketing automation. Creates contacts on registration, manages season-based tags (municipality season, active, waiting list, cancelled), syncs contact info (name, email, phone), and updates tags on status changes (enrollment, cancellation, waiting list moves). Feature-flagged via environment variable.

**Priority:** `Medium`
**Complexity:** `Medium` — API client for ActiveCampaign REST API, contact CRUD, tag management, and hooks into registration/enrollment/cancellation flows. The integration points are spread across multiple features, so it touches many code paths.

---

### 21. Webflow Webhook Integration

**Description:** Webhook receiver for events from a Webflow-hosted marketing website. Processes incoming data from the external site (likely form submissions or CMS changes).

**Priority:** `Low`
**Complexity:** `Low` — A single webhook API route with payload validation and processing logic.

---

### 22. Welcome Email Tracking & Bulk Send

**Description:** Per-participant tracking of whether a welcome email has been sent, with a toggle in the participant management UI. Admins can trigger bulk welcome emails for all participants in a club, sending personalized emails with club details, meeting times, and instructions.

**Priority:** `Medium`
**Complexity:** `Low` — A boolean flag on enrollments, a bulk send API endpoint that iterates participants and sends templated emails, and a toggle + button in the admin UI.

---

## Discord Integration

### 23. Discord Bot & Community Features

**Description:** A Discord.js bot with slash commands for managing virtual classrooms and voice lobbies:
- `/setup room set/unset` — Configure a Discord channel as a classroom with message templates
- `/setup lobby set/unset` — Designate a voice channel as a lobby
- `/room open <club>` — Open a classroom for a specific club (with autocomplete)
- `/room close` — Close the active classroom

Also includes Discord OAuth2 account linking (connect platform account to Discord), automatic Discord role assignment/removal on subscription changes, guild member search, and nickname caching. Each club can be associated with a Discord guild and role.

**Priority:** `Low`
**Complexity:** `High` — A separate Discord.js bot process, OAuth2 flow, role management API calls, and database models for classroom/lobby configuration. Sogverse replaced Discord voice with Daily.co, so this is only relevant if a Discord community presence is still desired alongside the platform.

---

## Operational Tools

### 24. Scheduled Jobs System

**Description:** A persistent job scheduler using node-schedule. Jobs are stored in the database with a name, function reference, cron expression or one-time date, and metadata. On server startup, all active jobs are loaded and scheduled. Supports job functions like automated Chargebee subscription cancellation (with email notification, participation cancellation, Discord role removal, and CRM updates). Admins can create scheduled actions via API.

**Priority:** `Medium`
**Complexity:** `Medium` — Sogverse already uses pg_cron for the weekly enrollment charge job. A more general-purpose job system would need a `scheduled_jobs` table, a registry of job functions, and either pg_cron entries or an external scheduler. The question is whether pg_cron plus Supabase Edge Functions covers the use cases, or if a dedicated job queue is needed.

---

### 25. Audit / Information Logging

**Description:** A structured logging system that records events with type (INFO, ERROR), scope (login, municipalityRegistration, activecampaign, etc.), optional user ID, and description. Stored in an `informationLog` database table for audit trail and debugging. Used throughout the API for tracking registrations, user creation, participation changes, and error conditions.

**Priority:** `Medium`
**Complexity:** `Low` — A single `information_logs` table with an insert-only RPC. The work is in adding log calls to existing code paths. Could also be implemented via Supabase's built-in audit logging or a lightweight wrapper.

---

### 26. Club Calendar View

**Description:** A calendar-organized view of all clubs grouped by weekday (Monday through Sunday, plus unscheduled). Features a powerful multi-dimensional filtering system using react-select multi-selects: filter by status, type, municipality, educator, and attendance type simultaneously. Includes a text search box. Each club is an expandable accordion showing full details. This is the primary operational view for admins and educators to see the weekly schedule at a glance.

**Priority:** `High`
**Complexity:** `Medium` — A page that fetches all products/groups, organizes them by `day_of_week`, and renders filterable accordion lists. Sogverse has group listing pages but they're flat lists without weekday grouping or multi-dimensional filtering. The filter state management is the main UI complexity.

---

### 27. Participant Notes

**Description:** Free-text notes that admins and educators can attach to individual participants within a club. Editable inline in the participant management UI. Used for tracking special needs, behavioral notes, or communication history.

**Priority:** `Medium`
**Complexity:** `Low` — A `notes` text column on enrollments (or a separate notes table), with an inline text editor in the group detail UI.

---

## Search & Discovery

### 29. Advanced Multi-Entity Search

**Description:** Dedicated search pages for each entity type with role-specific result cards:
- **GEDU Search** — Find educators by name/email, shows languages, billing method, Discord info, active status
- **Gamer Search** — Find gamers with subscription plan details, club memberships, parent info, municipality gamer status
- **Parent Search** — Find parents with linked gamers, subscriptions, Discord info
- **User Search** — Cross-role user search showing role-specific fields
- **Club Search** — Advanced club filtering by attendance type, municipality, content type, meeting day, type, language, status, and educator

Sogverse has basic admin user listing but lacks dedicated search pages with entity-specific filters and result cards.

**Priority:** `High`
**Complexity:** `Medium` — Search API endpoints with multi-field filtering, and dedicated search pages per entity type with result card components. The data model queries are moderately complex (joins across users, profiles, enrollments, groups, products).

---

## Summary by Priority

| Priority | Items |
|----------|-------|
| **Critical** | Municipality Registration, GEDU Invoicing, Municipality Invoicing |
| **High** | Lesson Management, Attendance Tracking, GEDU Profiles, Criminal Record Check, Reporting Suite, Club Pricing, Club Calendar View, Multi-Entity Search |
| **Medium** | Custom Fields, Lesson Rewards, Substitute Search, Achievement System, Code Domain System, ActiveCampaign CRM, Welcome Emails, Scheduled Jobs, Audit Logging, Participant Notes |
| **Low** | Activity Generator, Club Instructions, Entities, Webflow Webhooks, Discord Bot |
