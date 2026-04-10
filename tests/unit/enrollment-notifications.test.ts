import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendEnrollmentNotifications, sendUnenrollmentNotifications } from "@/lib/enrollment-notifications";

// --- Mocks ---

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

const mockSendTransactionalEmail = vi.fn().mockResolvedValue({ messageId: "msg-1" });
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) => mockSendTransactionalEmail(...args),
}));

vi.mock("@/lib/email-templates/enrollment-changes", () => ({
  buildEnrollmentParentEmail: vi.fn(() => "<html>enrollment-parent</html>"),
  buildEnrollmentGeduEmail: vi.fn(() => "<html>enrollment-gedu</html>"),
  buildUnenrollmentParentEmail: vi.fn(() => "<html>unenrollment-parent</html>"),
  buildUnenrollmentGeduEmail: vi.fn(() => "<html>unenrollment-gedu</html>"),
}));


// --- Helpers ---

const MOCK_CTX = {
  customerId: "customer-1",
  gamerId: "gamer-1",
  groupId: "group-1",
};

function setupMockData(overrides?: {
  parentEmail?: string;
  geduEmail?: string;
  adminEmails?: string[];
  minecraftUsername?: string | null;
  minecraftUuid?: string | null;
}) {
  const parentEmail = overrides?.parentEmail ?? "parent@test.com";
  const geduEmail = overrides?.geduEmail ?? "gedu@test.com";
  const adminEmails = overrides?.adminEmails ?? ["admin1@test.com", "admin2@test.com"];
  const minecraftUsername = overrides?.minecraftUsername ?? "PlayerOne";
  const minecraftUuid = overrides?.minecraftUuid ?? "uuid-123";

  mockFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn().mockImplementation((selectStr: string) => {
          // Admin emails query
          if (selectStr === "email") {
            return {
              eq: vi.fn().mockResolvedValue({
                data: adminEmails.map((email) => ({ email })),
                error: null,
              }),
            };
          }
          // Parent profile (now includes language_preference)
          if (selectStr.includes("display_name") && selectStr.includes("email") && selectStr.includes("language_preference") && !selectStr.includes("minecraft")) {
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { display_name: "Parent Name", email: parentEmail, language_preference: null },
                  error: null,
                }),
              }),
            };
          }
          // Gamer profile with minecraft
          if (selectStr.includes("minecraft_accounts")) {
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    display_name: "Gamer Name",
                    minecraft_accounts: { minecraft_username: minecraftUsername, minecraft_uuid: minecraftUuid },
                  },
                  error: null,
                }),
              }),
            };
          }
          return { eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { message: "Unknown" } }) }) };
        }),
      };
    }
    if (table === "product_groups") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                gedu_id: "gedu-1",
                products: { name: "Minecraft 101" },
                profiles: { display_name: "Gedu Name", email: geduEmail, language_preference: null },
              },
              error: null,
            }),
          }),
        }),
      };
    }
    return {};
  });
}

// --- Tests ---

describe("sendEnrollmentNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends emails to parent (BCC admins) and gedu (CC admins)", async () => {
    setupMockData();

    await sendEnrollmentNotifications(MOCK_CTX);

    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(2);

    // Parent email
    const parentCall = mockSendTransactionalEmail.mock.calls[0][0];
    expect(parentCall.toEmail).toBe("parent@test.com");
    expect(parentCall.bcc).toEqual(["admin1@test.com", "admin2@test.com"]);
    expect(parentCall.cc).toBeUndefined();

    // Gedu email
    const geduCall = mockSendTransactionalEmail.mock.calls[1][0];
    expect(geduCall.toEmail).toBe("gedu@test.com");
    expect(geduCall.cc).toEqual(["admin1@test.com", "admin2@test.com"]);
    expect(geduCall.bcc).toBeUndefined();
  });

  it("logs error and does not throw when data fetch fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        }),
      }),
    }));

    await expect(sendEnrollmentNotifications(MOCK_CTX)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to send enrollment notifications:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("logs error and does not throw when email send fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupMockData();
    mockSendTransactionalEmail.mockRejectedValueOnce(new Error("Brevo error"));

    await expect(sendEnrollmentNotifications(MOCK_CTX)).resolves.toBeUndefined();
    // With Promise.allSettled, per-email failures are logged individually
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to send enrollment notification:",
      expect.any(Error),
    );
    // The other email should still be sent
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });
});

describe("sendUnenrollmentNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends emails to parent (BCC admins) and gedu (CC admins)", async () => {
    setupMockData();

    await sendUnenrollmentNotifications(MOCK_CTX);

    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(2);

    // Parent email
    const parentCall = mockSendTransactionalEmail.mock.calls[0][0];
    expect(parentCall.toEmail).toBe("parent@test.com");
    expect(parentCall.bcc).toEqual(["admin1@test.com", "admin2@test.com"]);

    // Gedu email
    const geduCall = mockSendTransactionalEmail.mock.calls[1][0];
    expect(geduCall.toEmail).toBe("gedu@test.com");
    expect(geduCall.cc).toEqual(["admin1@test.com", "admin2@test.com"]);
  });

  it("passes minecraft data through for gedu whitelist removal", async () => {
    setupMockData({ minecraftUsername: "TestPlayer", minecraftUuid: "test-uuid" });

    await sendUnenrollmentNotifications(MOCK_CTX);

    const { buildUnenrollmentGeduEmail } = await import("@/lib/email-templates/enrollment-changes");
    expect(buildUnenrollmentGeduEmail).toHaveBeenCalledWith(
      expect.any(Function),  // translator
      "en",                  // locale
      expect.objectContaining({
        minecraftUsername: "TestPlayer",
        minecraftUuid: "test-uuid",
      }),
    );
  });

  it("logs error and does not throw when data fetch fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        }),
      }),
    }));

    await expect(sendUnenrollmentNotifications(MOCK_CTX)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to send unenrollment notifications:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
