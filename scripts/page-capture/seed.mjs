/**
 * Build one throwaway fleet on STAGING for a screenshot pass.
 *
 *   node scripts/page-capture/seed.mjs [--pin 1234] [--live-minutes 90]
 *                                      [--live-started 15] [--out seed-state.json]
 *
 * Creates a parent (with a PIN), two gamers linked to them, a certified gedu,
 * an admin, and one temporary club whose group carries a written-up history:
 * three past sessions with the gedu's family-facing report, their private note
 * and attendance marks, one session **in progress right now** so the voice room
 * is joinable while the capture runs, and one future session.
 *
 * Everything it writes is prefixed `TEMP-capture-<runId>`, so a second seed can
 * run beside a first fleet without either noticing the other. It finishes by
 * writing `seed-state.json` — every id, address and resolved route the capture
 * and cleanup scripts need. Nothing else in this tool talks to the database.
 *
 * ## Why the seeding goes through RPCs rather than INSERTs
 *
 * Every write here that has an RPC uses it, called with a **real signed-in
 * user's token** — the admin's for product and enrolment work, the gedu's for
 * the session write-ups. That is not ceremony: the admin RPCs guard on
 * `assert_admin()`, which reads `auth.uid()`, so the service-role key cannot
 * call them at all. It also means the fixture is built through the same CHECKs,
 * RAISEs and RLS the admin UI meets, so a seed that succeeds is a seed the
 * product could have produced.
 *
 * The service-role key is used for exactly three things, each of which has no
 * RPC and no other way in: creating auth users, promoting a profile's role
 * (which is what `docs/runbooks/create-admin-account.md` prescribes by hand),
 * and stamping `email_verified_at`.
 *
 * ## The live session
 *
 * A group session exists on any date whose weekday matches one of the product's
 * schedule slots — the window is derived from the slot, never stored ahead of
 * time. So one slot, placed on *today's* weekday with a start time a few
 * minutes in the past, gives a session that is under way at the moment the tool
 * runs. Every other session this seed writes sits 7, 14, 21 days back or 7 days
 * forward, which lands them all on that same weekday and therefore on that same
 * slot. One slot, five sessions, no arithmetic anywhere else.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  argOf,
  assertStaging,
  createAuthUser,
  loadEnvLocal,
  log,
  makeRunId,
  REPO_ROOT,
  signIn,
  supabaseClient,
} from "./lib.mjs";

loadEnvLocal();
const { url, serviceKey, anonKey, ref } = assertStaging();

const RUN_ID = makeRunId();
const TAG = `TEMP-capture-${RUN_ID}`;
const PIN = argOf("pin", "1357");
const LIVE_MINUTES = Number(argOf("live-minutes", "90"));
const LIVE_STARTED_MINUTES_AGO = Number(argOf("live-started", "15"));
const OUT = path.resolve(argOf("out", path.join(REPO_ROOT, "scripts/page-capture/seed-state.json")));

/**
 * One password for the whole fleet. These accounts exist for the length of one
 * capture run against staging and are deleted by `cleanup.mjs`; a per-account
 * secret would be four values to thread into Playwright for no gain.
 */
const PASSWORD = `Capture-${RUN_ID}!`;

/** Products are authored in Helsinki, so the schedule is reasoned about there. */
const TIMEZONE = "Europe/Helsinki";

const service = supabaseClient({ url, key: serviceKey });

/**
 * What this run has created so far, in creation order.
 *
 * Module-level rather than local to `main` because `makeUser` appends to it
 * too, and because the failure path has to be able to name a partial fleet: a
 * seed that dies halfway has still left real rows on staging, and a message
 * that cannot list them leaves someone grepping for them by hand.
 */
const SEEDED = { authUserIds: [], productIds: [] };

// ---------------------------------------------------------------------------
// Dates. All of it in the product's zone, because that is the zone the schedule
// slot's wall clock is resolved in.
// ---------------------------------------------------------------------------

/** `{ y, m, d, hour, minute }` for an instant, read in a named zone. */
function zonedParts(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

/**
 * Step a `YYYY-MM-DD` by whole days.
 *
 * UTC-pinned on purpose: `Date.UTC` has no DST, so day arithmetic there is
 * exact, whereas stepping a zoned Date by 86_400_000 ms repeats or skips a
 * calendar date on the two transition days each year.
 */
function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const stepped = new Date(Date.UTC(y, m - 1, d + days));
  return stepped.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday, which is what `schedule_slots.weekday` stores. */
function weekdayOf(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const now = new Date();
const local = zonedParts(now, TIMEZONE);
const TODAY = `${local.y}-${String(local.m).padStart(2, "0")}-${String(local.d).padStart(2, "0")}`;

/**
 * The slot's start, in minutes past midnight, placed just far enough in the
 * past that today's session is already under way.
 *
 * Clamped at midnight rather than allowed to wrap: a negative start would move
 * the slot onto the previous day's weekday and quietly take the live session
 * with it. A run at 00:05 gets a session that started at midnight, which is odd
 * to look at and still correct — and is the only hour of the day it can happen.
 */
const liveStartMinutes = Math.max(0, local.hour * 60 + local.minute - LIVE_STARTED_MINUTES_AGO);
const SLOT_START_TIME =
  `${String(Math.floor(liveStartMinutes / 60)).padStart(2, "0")}:` +
  `${String(liveStartMinutes % 60).padStart(2, "0")}:00`;

const SESSIONS = {
  past: [addDays(TODAY, -21), addDays(TODAY, -14), addDays(TODAY, -7)],
  live: TODAY,
  future: addDays(TODAY, 7),
};
const START_DATE = addDays(TODAY, -35);
const END_DATE = addDays(TODAY, 42);

// ---------------------------------------------------------------------------
// The written-up history. Markdown, because the session report and gedu note
// are markdown-backed fields and a capture wants to see them rendered.
// ---------------------------------------------------------------------------

const WRITE_UPS = [
  {
    report:
      "### Redstone week one\n\n" +
      "We started on **simple circuits** — levers, redstone dust and a door that " +
      "actually opens. Everyone got a working design by the end of the hour.\n\n" +
      "- Built a two-lever AND gate together\n" +
      "- Talked about testing a circuit before decorating around it\n\n" +
      "Next week we take the same door and put it on a timer.",
    note:
      "Good energy. One of the two needed the circuit explained twice before it " +
      "landed — worth pairing them with someone confident next time.",
  },
  {
    report:
      "### Timers and repeaters\n\n" +
      "The door from last week is now on a repeater loop. This is the first " +
      "session where the group debugged *each other's* builds rather than waiting " +
      "for me, which is exactly the habit we are after.\n\n" +
      "> \"I found the bit that was wrong before it even ran.\"\n\n" +
      "Bring an idea for a small machine next week.",
    note: "Both engaged throughout. No behaviour notes.",
  },
  {
    report:
      "### Small machines\n\n" +
      "Free-build week. Two very different projects: an automatic bridge and a " +
      "sorting hopper chain. Both were finished and demoed to the group.\n\n" +
      "1. Everyone explained their build out loud\n" +
      "2. We took a screenshot tour at the end\n\n" +
      "A good week to look back on — the gap from week one is visible.",
    note:
      "Sorting chain was ambitious and nearly worked; a little help with the " +
      "comparator would finish it. Worth revisiting.",
  },
];

const LIVE_NOTE = {
  report:
    "### Today — comparators\n\n" +
    "Session in progress. We are picking the sorting chain back up and adding " +
    "the comparator that was missing last time.",
  note: "Written mid-session so the feed is not empty while the room is open.",
};

// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nPage-capture seed → staging (${ref})`);
  console.log(`Run id: ${RUN_ID}`);
  console.log(`Today in ${TIMEZONE}: ${TODAY} (weekday ${weekdayOf(TODAY)})`);
  console.log(`Live session window opens ${SLOT_START_TIME} for ${LIVE_MINUTES} min\n`);

  try {
    // -- People ------------------------------------------------------------
    log.step("Creating accounts");

    const parent = await makeUser("parent", { firstName: "Petra", lastName: `Capture${RUN_ID.slice(-4)}` });
    log.ok(`parent  ${parent.email}`);

    const admin = await makeUser("admin", { firstName: "Aino", lastName: "Adminson" });
    await promoteRole(admin.id, "admin");
    log.ok(`admin   ${admin.email}`);

    const gedu = await makeUser("gedu", { firstName: "Gustav", lastName: "Eduardsson" });
    await service.rpc("register_gedu", {
      p_user_id: gedu.id,
      p_first_name: "Gustav",
      p_last_name: "Eduardsson",
      p_locale: "en",
      p_phone: "",
      p_spoken_languages: ["en", "fi"],
      p_location_ids: null,
      p_minecraft_username: "",
      p_minecraft_uuid: "",
      p_roblox_username: "",
      p_roblox_user_id: "",
    });
    log.ok(`gedu    ${gedu.email}`);

    // The gamers. A gamer's address is synthetic and opaque by design — nobody
    // ever types it — so it is generated the same way the app's own creation
    // route generates one, and the parent switches into the account rather than
    // logging into it.
    const gamers = [];
    for (const g of [
      { firstName: "Miro", dob: yearsAgo(11) },
      { firstName: "Vilja", dob: yearsAgo(9) },
    ]) {
      const email = `g${RUN_ID.replace(/-/g, "")}${g.firstName.toLowerCase()}@gamer.sogverse.internal`;
      const id = await createAuthUser(service, {
        email,
        firstName: g.firstName,
        lastName: parent.lastName,
      });
      SEEDED.authUserIds.push(id);
      await service.rpc("create_gamer", {
        p_gamer_id: id,
        p_parent_id: parent.id,
        p_first_name: g.firstName,
        p_last_name: parent.lastName,
        p_date_of_birth: g.dob,
        p_minecraft_username: `${g.firstName}Builds`,
      });
      gamers.push({ id, email, firstName: g.firstName });
      log.ok(`gamer   ${g.firstName} (${email})`);
    }

    // -- The parent's PIN ---------------------------------------------------
    //
    // Set through the RPC that hashes it server-side rather than through the
    // UI gate. `pin_hash` is a bcrypt hash produced by `crypt()` inside
    // Postgres, so there is nothing a script could compute and write directly
    // even if it wanted to — and this is the same function the reset flow uses.
    log.step("Setting the parent PIN");
    await service.rpc("set_pin_for_user", { p_user_id: parent.id, p_pin: PIN });
    log.ok(`PIN ${PIN} set for ${parent.email}`);

    // -- Tokens -------------------------------------------------------------
    log.step("Signing in as admin and gedu");
    const adminToken = await signIn({ url, anonKey }, admin.email, PASSWORD);
    const geduToken = await signIn({ url, anonKey }, gedu.email, PASSWORD);
    const asAdmin = supabaseClient({ url, key: anonKey, token: adminToken });
    const asGedu = supabaseClient({ url, key: anonKey, token: geduToken });
    log.ok("both sessions live");

    // The two staff flags an admin sets from the user-detail page. Certification
    // is what lets the gedu be assigned to a group at all.
    await asAdmin.rpc("set_gedu_certified", { p_gedu_id: gedu.id, p_certified: true });
    await asAdmin.rpc("set_gedu_criminal_record_check", { p_gedu_id: gedu.id, p_passed: true });
    log.ok("gedu certified + criminal record check recorded");

    // -- The product --------------------------------------------------------
    log.step("Creating the temp club");
    const productName = `${TAG} — redstone club`;
    const productId = await asAdmin.rpc("create_product", {
      p_product_type: "consumer_club",
      // `free` on purpose, and it does two things: `admin_enroll_participant`
      // refuses a *paid* consumer club outright (its seat cannot exist without
      // a Stripe subscription), and a no-charge product with exactly one group
      // places its enrolments automatically — so the roster fills with no
      // second call.
      p_billing_mode: "free",
      p_translations: [
        {
          locale: "en",
          name: productName,
          short_description: "A temporary club created for a screenshot pass. Safe to delete.",
          long_description:
            "This club exists only so a capture run has a realistic page to " +
            "photograph: a written-up history, a live session and a roster.\n\n" +
            "It is created and destroyed by `scripts/page-capture`.",
        },
        {
          locale: "fi",
          name: productName,
          short_description: "Väliaikainen kerho kuvakaappauksia varten. Voi poistaa.",
          long_description: "Tämän kerhon luo ja poistaa `scripts/page-capture`.",
        },
      ],
      p_topic: "minecraft_java",
      p_spoken_language_code: "en",
      p_is_remote: true,
      p_timezone: TIMEZONE,
      p_registration_opens_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      p_for_gamers: true,
      p_for_parents: false,
      p_min_age: 7,
      p_max_age: 16,
      p_status: "running",
      p_is_visible: true,
      p_waitlist_enabled: true,
      p_start_date: START_DATE,
      p_end_date: END_DATE,
      p_seat_count: 12,
      p_schedule_slots: [
        {
          weekday: weekdayOf(TODAY),
          start_time: SLOT_START_TIME,
          duration_minutes: LIVE_MINUTES,
        },
      ],
    });
    SEEDED.productIds.push(productId);
    log.ok(`product ${productId}`);

    // -- The group, with the gedu on it -------------------------------------
    const groupResult = await asAdmin.rpc("apply_group_changes", {
      p_product_id: productId,
      p_added_groups: [{ tempId: "g1", name: `${TAG} group A`, geduIds: [gedu.id] }],
    });
    const groupId = groupResult.tempMap.g1;
    log.ok(`group ${groupId} (gedu assigned)`);

    // -- Enrolment ----------------------------------------------------------
    log.step("Enrolling the gamers");
    for (const gamer of gamers) {
      const result = await asAdmin.rpc("admin_enroll_participant", {
        p_product_id: productId,
        p_participant_id: gamer.id,
      });
      gamer.participationId = result.participation_id ?? result.id ?? null;
      log.ok(`${gamer.firstName} → participation ${gamer.participationId ?? "(id not returned)"}`);
    }

    // The RPC's return shape is not something to guess at. Read the rows back
    // and take the ids from the table, so a changed payload key surfaces as a
    // missing route rather than a silently wrong one.
    const participations = await asAdmin.select(
      "participations",
      `product_id=eq.${productId}&select=id,participant_id,group_id,status`,
    );
    for (const gamer of gamers) {
      const row = participations.find((p) => p.participant_id === gamer.id);
      if (!row) throw new Error(`no participation row for ${gamer.firstName}`);
      if (!row.group_id) throw new Error(`${gamer.firstName} was not placed in a group`);
      gamer.participationId = row.id;
    }
    log.ok(`${participations.length} participations, all placed`);

    // -- The written-up history ---------------------------------------------
    //
    // Written as the GEDU, not as the admin. Both roles are allowed through the
    // guard, but `updated_by` / `recorded_by` are stamped with the caller — so
    // writing these as the admin would produce a feed attributed to the wrong
    // person, which is exactly the sort of detail a screenshot shows.
    log.step("Writing the session history as the gedu");
    const sessionDates = [];

    for (const [i, date] of SESSIONS.past.entries()) {
      const w = WRITE_UPS[i];
      await asGedu.rpc("set_group_session_notes", {
        p_group_id: groupId,
        p_session_date: date,
        p_report: w.report,
        p_gedu_note: w.note,
      });
      for (const [j, gamer] of gamers.entries()) {
        // One absence in the middle week, so the roster is not a wall of
        // identical marks — an attendance UI with only one state in it tells a
        // reviewer nothing about the other states.
        const status = i === 1 && j === 1 ? "absent" : "present";
        await asGedu.rpc("record_attendance", {
          p_group_id: groupId,
          p_session_date: date,
          p_participant_id: gamer.id,
          p_status: status,
        });
      }
      sessionDates.push({ date, kind: "past", hasReport: true });
      log.ok(`${date} — report, note and attendance`);
    }

    // Today. Attendance opens the moment the scheduled start passes, which the
    // slot placement above guarantees has already happened.
    await asGedu.rpc("set_group_session_notes", {
      p_group_id: groupId,
      p_session_date: SESSIONS.live,
      p_report: LIVE_NOTE.report,
      p_gedu_note: LIVE_NOTE.note,
    });
    for (const gamer of gamers) {
      await asGedu.rpc("record_attendance", {
        p_group_id: groupId,
        p_session_date: SESSIONS.live,
        p_participant_id: gamer.id,
        p_status: "present",
      });
    }
    sessionDates.push({ date: SESSIONS.live, kind: "live", hasReport: true });
    log.ok(`${SESSIONS.live} — LIVE now, report and attendance`);

    // The future session is deliberately left blank: it is materialized by the
    // schedule, and an unwritten upcoming session is what one actually looks
    // like.
    sessionDates.push({ date: SESSIONS.future, kind: "future", hasReport: false });
    log.ok(`${SESSIONS.future} — upcoming (nothing written, by design)`);

    // -- State --------------------------------------------------------------
    const state = {
      runId: RUN_ID,
      tag: TAG,
      createdAt: new Date().toISOString(),
      supabase: { url, ref },
      password: PASSWORD,
      pin: PIN,
      timezone: TIMEZONE,
      accounts: {
        parent: { id: parent.id, email: parent.email, firstName: parent.firstName },
        admin: { id: admin.id, email: admin.email },
        gedu: { id: gedu.id, email: gedu.email },
        gamers: gamers.map((g) => ({
          id: g.id,
          email: g.email,
          firstName: g.firstName,
          participationId: g.participationId,
        })),
      },
      product: {
        id: productId,
        name: productName,
        type: "consumer_club",
        groupId,
        adminSection: "consumer-clubs",
      },
      sessions: {
        slotStartTime: SLOT_START_TIME,
        durationMinutes: LIVE_MINUTES,
        liveDate: SESSIONS.live,
        /** Best-effort: when the live window closes, for a capture run to check itself against. */
        liveEndsAt: new Date(now.getTime() + (LIVE_MINUTES - LIVE_STARTED_MINUTES_AGO) * 60_000).toISOString(),
        all: sessionDates,
      },
      routes: {
        publicProduct: `/shop/${productId}`,
        parentProduct: `/parent/clubs/${gamers[0].participationId}`,
        parentProductSibling: `/parent/clubs/${gamers[1].participationId}`,
        parentGamer: `/parent/gamers/${gamers[0].id}`,
        gamerProduct: `/gamer/clubs/${gamers[0].participationId}`,
        geduProduct: `/gedu/clubs/${productId}`,
        adminProduct: `/admin/consumer-clubs/${productId}`,
        adminProductGroup: `/admin/consumer-clubs/${productId}/groups/${groupId}`,
        adminUser: `/admin/users/${gedu.id}`,
        voiceRoom: `/voice/group/${groupId}`,
      },
      /** Everything cleanup deletes, listed rather than rediscovered. */
      cleanup: {
        authUserIds: SEEDED.authUserIds,
        productIds: SEEDED.productIds,
      },
    };

    writeFileSync(OUT, `${JSON.stringify(state, null, 2)}\n`);

    log.step("Done");
    console.log(`  state → ${OUT}`);
    console.log(`  parent login: ${parent.email} / ${PASSWORD}  (PIN ${PIN})`);
    console.log(`  live session runs until ~${state.sessions.liveEndsAt}`);
    console.log(`\n  Next: node scripts/page-capture/capture.mjs --base-url http://localhost:3002`);
    console.log(`  Then: node scripts/page-capture/cleanup.mjs\n`);
  } catch (err) {
    console.error(`\n  Seed failed: ${err.message}`);
    if (created.authUsers.length > 0 || created.productIds.length > 0) {
      console.error(
        `\n  Partial fleet left behind. Auth users: ${created.authUsers.join(", ") || "none"}; ` +
          `products: ${created.productIds.join(", ") || "none"}.\n` +
          `  Delete them with:  node scripts/page-capture/cleanup.mjs --users ${created.authUsers.join(",")} --products ${created.productIds.join(",")}\n`,
      );
    }
    process.exitCode = 1;
  }
}

/** Create the auth user and record it, so a mid-run failure can name what it left. */
async function makeUser(kind, { firstName, lastName = "" }) {
  const email = `temp-capture-${RUN_ID}-${kind}@sogverse.test`;
  const id = await createAuthUser(service, { email, password: PASSWORD, firstName, lastName });
  SEEDED.authUserIds.push(id);
  await service.update("profiles", `id=eq.${id}`, { email_verified_at: new Date().toISOString() });
  return { id, email, firstName, lastName };
}

/**
 * Promote a trigger-seeded `customer` profile, and drop the extension row the
 * trigger created with it — the shape `docs/runbooks/create-admin-account.md`
 * prescribes. No RPC covers this: `create_gamer` and `register_gedu` are the
 * only promotion paths the database offers, and neither makes an admin.
 */
async function promoteRole(userId, role) {
  await service.update("profiles", `id=eq.${userId}&role=eq.customer`, { role, locale: "en" });
  await service.remove("customer_profiles", `user_id=eq.${userId}`);
}

/** A birthday `n` years ago today, as `YYYY-MM-DD`. */
function yearsAgo(n) {
  const [y, m, d] = TODAY.split("-").map(Number);
  return `${y - n}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

await main();
