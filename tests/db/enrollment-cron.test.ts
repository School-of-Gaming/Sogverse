import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  resetEnrollmentState,
} from "./helpers";
import { TEST_IDS, SEED } from "./constants";

/**
 * Set the test product's schedule so that the next session is ~2 hours from
 * now in UTC. This guarantees process_enrollment_charges() sees the enrollment
 * inside the 24h charge window, regardless of when the test runs.
 */
async function setProductScheduleToSoon(admin: SupabaseClient<Database>) {
  const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const jsDay = twoHoursLater.getUTCDay(); // 0=Sun..6=Sat
  const ourDay = jsDay === 0 ? 6 : jsDay - 1; // Mon=0..Sun=6
  const h = String(twoHoursLater.getUTCHours()).padStart(2, "0");
  const m = String(twoHoursLater.getUTCMinutes()).padStart(2, "0");

  await admin
    .from("products")
    .update({
      day_of_week: ourDay,
      start_time: `${h}:${m}`,
      timezone: "UTC",
    })
    .eq("id", TEST_IDS.PRODUCT);
}

/** Reset the product schedule to seed values after cron tests. */
async function resetProductSchedule(admin: SupabaseClient<Database>) {
  await admin
    .from("products")
    .update({
      day_of_week: 2, // Wednesday
      start_time: "15:00",
      timezone: "Europe/Helsinki",
    })
    .eq("id", TEST_IDS.PRODUCT);
}

/**
 * Enroll the test gamer with a past session_date so that the cron sees
 * "no charge for the upcoming session" and needs to charge.
 */
async function enrollWithPastCharge(admin: SupabaseClient<Database>) {
  const { data, error } = await admin.rpc("enroll_gamer_in_group", {
    p_customer_id: TEST_IDS.CUSTOMER,
    p_gamer_id: TEST_IDS.GAMER,
    p_group_id: TEST_IDS.GROUP,
    p_session_date: "2020-01-01", // far in the past — cron won't match this date
  });

  if (error) throw new Error(`Enrollment setup failed: ${error.message}`);
  const rows = data as {
    enrollment_id: string;
    transaction_id: string;
    new_balance: number;
  }[];
  return rows[0];
}

describe("cron job registration", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  it("process-enrollment-charges job is scheduled hourly", async () => {
    const { data, error } = await admin.rpc("_list_cron_jobs");

    expect(error).toBeNull();

    const jobs = data as { jobname: string; schedule: string; command: string }[];
    const chargeJob = jobs.find((j) => j.jobname === "process-enrollment-charges");

    expect(chargeJob).toBeDefined();
    expect(chargeJob!.schedule).toBe("0 * * * *");
    expect(chargeJob!.command).toContain("process_enrollment_charges");
  });
});

describe("process_enrollment_charges (cron)", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  beforeEach(async () => {
    await resetEnrollmentState(admin);
    await resetProductSchedule(admin);
  });

  it("charges an active enrollment within the charge window", async () => {
    await setProductScheduleToSoon(admin);
    const enrollment = await enrollWithPastCharge(admin);
    const balanceAfterEnroll = enrollment.new_balance; // 20 - 2 = 18

    // Run cron
    const { data: result, error } = await admin.rpc("process_enrollment_charges");

    expect(error).toBeNull();
    const summary = result as { charged: number; unenrolled: number; errors: number };
    expect(summary.charged).toBe(1);
    expect(summary.unenrolled).toBe(0);
    expect(summary.errors).toBe(0);

    // Verify new charge record was created (2 total: past + upcoming)
    const { data: charges } = await admin
      .from("enrollment_charges")
      .select("amount, session_date")
      .eq("enrollment_id", enrollment.enrollment_id)
      .order("session_date", { ascending: true });

    expect(charges).toHaveLength(2);
    expect(charges![0].session_date).toBe("2020-01-01"); // original
    expect(charges![1].amount).toBe(SEED.PRODUCT_TOKEN_COST); // cron charged at product cost

    // Verify balance was deducted again
    const { data: customer } = await admin
      .from("customer_profiles")
      .select("token_balance")
      .eq("user_id", TEST_IDS.CUSTOMER)
      .single();

    expect(customer!.token_balance).toBe(balanceAfterEnroll - SEED.PRODUCT_TOKEN_COST);
  });

  it("does not double-charge for the same session (idempotency)", async () => {
    await setProductScheduleToSoon(admin);
    await enrollWithPastCharge(admin);

    // Run cron twice
    await admin.rpc("process_enrollment_charges");
    const { data: result } = await admin.rpc("process_enrollment_charges");

    const summary = result as { charged: number; unenrolled: number; errors: number };
    // Second run should skip — charge already exists for this session_date
    expect(summary.charged).toBe(0);

    // Only 2 charges total (initial + first cron run)
    const { data: charges } = await admin
      .from("enrollment_charges")
      .select("id")
      .eq("enrollment_id", (await admin
        .from("group_enrollments")
        .select("id")
        .eq("gamer_id", TEST_IDS.GAMER)
        .eq("status", "active")
        .single()
        .then(r => r.data!.id)));

    expect(charges).toHaveLength(2);
  });

  it("auto-unenrolls when customer has insufficient balance", async () => {
    await setProductScheduleToSoon(admin);
    await enrollWithPastCharge(admin);

    // Drain customer balance to 0 (enroll cost 2 from 20 → 18; set to 0)
    await admin
      .from("customer_profiles")
      .update({ token_balance: 0 })
      .eq("user_id", TEST_IDS.CUSTOMER);

    // Run cron — should fail to charge and auto-unenroll
    const { data: result, error } = await admin.rpc("process_enrollment_charges");

    expect(error).toBeNull();
    const summary = result as { charged: number; unenrolled: number; errors: number };
    expect(summary.charged).toBe(0);
    expect(summary.unenrolled).toBe(1);

    // Verify enrollment was marked as unenrolled
    const { data: enrollment } = await admin
      .from("group_enrollments")
      .select("status, unenrolled_at")
      .eq("gamer_id", TEST_IDS.GAMER)
      .eq("enrolled_by", TEST_IDS.CUSTOMER)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    expect(enrollment!.status).toBe("unenrolled");
    expect(enrollment!.unenrolled_at).not.toBeNull();
  });

  it("skips enrollments outside the charge window", async () => {
    // Set product to 4 days from now — outside the 24h window.
    // (Don't use 8 days: 8 % 7 = 1, so compute_next_session returns tomorrow.)
    const fourDaysLater = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    const jsDay = fourDaysLater.getUTCDay();
    const ourDay = jsDay === 0 ? 6 : jsDay - 1;
    const h = String(fourDaysLater.getUTCHours()).padStart(2, "0");

    await admin
      .from("products")
      .update({ day_of_week: ourDay, start_time: `${h}:00`, timezone: "UTC" })
      .eq("id", TEST_IDS.PRODUCT);

    await enrollWithPastCharge(admin);

    const { data: result } = await admin.rpc("process_enrollment_charges");

    const summary = result as { charged: number; unenrolled: number; errors: number };
    expect(summary.charged).toBe(0);
    expect(summary.unenrolled).toBe(0);
  });
});
