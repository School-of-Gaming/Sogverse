import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME_ENROLLMENT } from "@/lib/constants";
import {
  buildGroupAddedEmail,
  buildGroupDeletedEmail,
  buildGroupReassignedOldGeduEmail,
  buildGroupReassignedNewGeduEmail,
  buildGroupReassignedParentEmail,
  buildGamerMovedParentEmail,
  buildGamerMovedOldGeduEmail,
  buildGamerMovedNewGeduEmail,
  groupChangeSubjects,
} from "@/lib/email-templates/group-changes";
import type { NotifyPayload } from "@/hooks/use-group-editor";

const FROM_EMAIL = SENDER_EMAIL;
const FROM_NAME = SENDER_NAME_ENROLLMENT;

interface EmailJob {
  toEmail: string;
  subject: string;
  htmlContent: string;
  cc?: string[];
  bcc?: string[];
  description: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can send group notifications",
    });
    if (result instanceof NextResponse) return result;

    const { id: productId } = await params;
    const payload: NotifyPayload = await request.json();

    const admin = createAdminClient();

    // Fetch product name
    const { data: product } = await admin
      .from("products")
      .select("name")
      .eq("id", productId)
      .single();

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const productName = product.name;

    // Collect all unique user IDs we need to look up
    const geduIds = new Set<string>();
    const gamerIds = new Set<string>();

    for (const g of payload.addedGroups) geduIds.add(g.geduId);
    for (const g of payload.deletedGroups) geduIds.add(g.geduId);
    for (const g of payload.updatedGroups) {
      geduIds.add(g.oldGeduId);
      geduIds.add(g.newGeduId);
    }
    for (const m of payload.enrollmentMoves) {
      geduIds.add(m.fromGeduId);
      geduIds.add(m.toGeduId);
      gamerIds.add(m.gamerId);
    }

    // Remove empty strings
    geduIds.delete("");
    gamerIds.delete("");

    // Batch-fetch gedu profiles
    const geduProfiles = new Map<string, { displayName: string; email: string }>();
    if (geduIds.size > 0) {
      const { data: gedus } = await admin
        .from("profiles")
        .select("id, display_name, email")
        .in("id", Array.from(geduIds));
      for (const g of gedus ?? []) {
        if (g.email) {
          geduProfiles.set(g.id, { displayName: g.display_name, email: g.email });
        }
      }
    }

    // Batch-fetch gamer profiles + their enrolled_by parent IDs
    const gamerProfiles = new Map<string, { displayName: string }>();
    const gamerParentIds = new Map<string, string>(); // gamerId → parentId
    if (gamerIds.size > 0) {
      const { data: gamers } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", Array.from(gamerIds));
      for (const g of gamers ?? []) {
        gamerProfiles.set(g.id, { displayName: g.display_name });
      }

      // Look up enrolled_by from group_enrollments for these gamers in this product
      const { data: enrollments } = await admin
        .from("group_enrollments")
        .select("gamer_id, enrolled_by, product_groups!inner(product_id)")
        .eq("product_groups.product_id", productId)
        .in("gamer_id", Array.from(gamerIds));
      for (const e of enrollments ?? []) {
        if (e.enrolled_by) {
          gamerParentIds.set(e.gamer_id, e.enrolled_by);
        }
      }
    }

    // For reassigned groups: fetch parent IDs for gamers currently in those groups
    // (excluding gamers being moved out)
    const movedGamerIds = new Set(payload.enrollmentMoves.map((m) => m.gamerId));
    const reassignedGroupIds = payload.updatedGroups.map((g) => g.groupId).filter(Boolean);
    const reassignmentParentMap = new Map<string, Map<string, { gamerId: string; parentId: string }>>();

    if (reassignedGroupIds.length > 0) {
      const { data: enrollments } = await admin
        .from("group_enrollments")
        .select("gamer_id, enrolled_by, group_id")
        .in("group_id", reassignedGroupIds);

      for (const e of enrollments ?? []) {
        if (e.enrolled_by && !movedGamerIds.has(e.gamer_id)) {
          if (!reassignmentParentMap.has(e.group_id)) {
            reassignmentParentMap.set(e.group_id, new Map());
          }
          reassignmentParentMap.get(e.group_id)!.set(e.gamer_id, {
            gamerId: e.gamer_id,
            parentId: e.enrolled_by,
          });
        }
      }

      // Fetch gamer display names for reassignment notifications
      const reassignmentGamerIds = new Set<string>();
      for (const map of reassignmentParentMap.values()) {
        for (const { gamerId } of map.values()) {
          if (!gamerProfiles.has(gamerId)) reassignmentGamerIds.add(gamerId);
        }
      }
      if (reassignmentGamerIds.size > 0) {
        const { data: gamers } = await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", Array.from(reassignmentGamerIds));
        for (const g of gamers ?? []) {
          gamerProfiles.set(g.id, { displayName: g.display_name });
        }
      }
    }

    // Fetch all parent profiles we need
    const allParentIds = new Set<string>();
    for (const parentId of gamerParentIds.values()) allParentIds.add(parentId);
    for (const map of reassignmentParentMap.values()) {
      for (const { parentId } of map.values()) allParentIds.add(parentId);
    }

    const parentProfiles = new Map<string, { displayName: string; email: string }>();
    if (allParentIds.size > 0) {
      const { data: parents } = await admin
        .from("profiles")
        .select("id, display_name, email")
        .in("id", Array.from(allParentIds));
      for (const p of parents ?? []) {
        if (p.email) {
          parentProfiles.set(p.id, { displayName: p.display_name, email: p.email });
        }
      }
    }

    // Fetch admin emails for CC/BCC
    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("email")
      .eq("role", "admin");
    const adminEmails: string[] = (adminProfiles ?? [])
      .map((a: { email: string | null }) => a.email)
      .filter((e: string | null): e is string => !!e);

    // --- Build email jobs ---
    const jobs: EmailJob[] = [];

    // Group added
    for (const g of payload.addedGroups) {
      const gedu = geduProfiles.get(g.geduId);
      if (!gedu) continue;
      jobs.push({
        toEmail: gedu.email,
        subject: groupChangeSubjects.groupAdded(productName),
        htmlContent: buildGroupAddedEmail({ geduName: gedu.displayName, productName }),
        cc: adminEmails.filter((e) => e !== gedu.email),
        description: `Group added → ${gedu.email}`,
      });
    }

    // Group deleted
    for (const g of payload.deletedGroups) {
      const gedu = geduProfiles.get(g.geduId);
      if (!gedu) continue;
      jobs.push({
        toEmail: gedu.email,
        subject: groupChangeSubjects.groupDeleted(productName),
        htmlContent: buildGroupDeletedEmail({ geduName: gedu.displayName, productName }),
        cc: adminEmails.filter((e) => e !== gedu.email),
        description: `Group deleted → ${gedu.email}`,
      });
    }

    // Group reassigned
    for (const g of payload.updatedGroups) {
      const oldGedu = geduProfiles.get(g.oldGeduId);
      const newGedu = geduProfiles.get(g.newGeduId);
      if (!oldGedu || !newGedu) continue;

      // Old gedu
      jobs.push({
        toEmail: oldGedu.email,
        subject: groupChangeSubjects.groupReassignedOldGedu(productName),
        htmlContent: buildGroupReassignedOldGeduEmail({
          oldGeduName: oldGedu.displayName,
          newGeduName: newGedu.displayName,
          productName,
        }),
        cc: adminEmails.filter((e) => e !== oldGedu.email),
        description: `Reassigned (old gedu) → ${oldGedu.email}`,
      });

      // New gedu
      jobs.push({
        toEmail: newGedu.email,
        subject: groupChangeSubjects.groupReassignedNewGedu(productName),
        htmlContent: buildGroupReassignedNewGeduEmail({
          oldGeduName: oldGedu.displayName,
          newGeduName: newGedu.displayName,
          productName,
        }),
        cc: adminEmails.filter((e) => e !== newGedu.email),
        description: `Reassigned (new gedu) → ${newGedu.email}`,
      });

      // Parents of gamers in the reassigned group (excluding moved gamers)
      const groupEnrollments = reassignmentParentMap.get(g.groupId);
      if (groupEnrollments) {
        for (const { gamerId, parentId } of groupEnrollments.values()) {
          const parent = parentProfiles.get(parentId);
          const gamer = gamerProfiles.get(gamerId);
          if (!parent || !gamer) continue;
          jobs.push({
            toEmail: parent.email,
            subject: groupChangeSubjects.groupReassignedParent(gamer.displayName, productName),
            htmlContent: buildGroupReassignedParentEmail({
              parentName: parent.displayName,
              gamerName: gamer.displayName,
              oldGeduName: oldGedu.displayName,
              newGeduName: newGedu.displayName,
              productName,
            }),
            bcc: adminEmails.filter((e) => e !== parent.email),
            description: `Reassigned (parent) → ${parent.email}`,
          });
        }
      }
    }

    // Gamer moved
    for (const m of payload.enrollmentMoves) {
      const oldGedu = geduProfiles.get(m.fromGeduId);
      const newGedu = geduProfiles.get(m.toGeduId);
      const gamer = gamerProfiles.get(m.gamerId);
      if (!oldGedu || !newGedu || !gamer) continue;

      // Parent
      const parentId = gamerParentIds.get(m.gamerId);
      if (parentId) {
        const parent = parentProfiles.get(parentId);
        if (parent) {
          jobs.push({
            toEmail: parent.email,
            subject: groupChangeSubjects.gamerMovedParent(gamer.displayName, productName),
            htmlContent: buildGamerMovedParentEmail({
              parentName: parent.displayName,
              gamerName: gamer.displayName,
              oldGeduName: oldGedu.displayName,
              newGeduName: newGedu.displayName,
              productName,
            }),
            bcc: adminEmails.filter((e) => e !== parent.email),
            description: `Gamer moved (parent) → ${parent.email}`,
          });
        }
      }

      // Old gedu
      jobs.push({
        toEmail: oldGedu.email,
        subject: groupChangeSubjects.gamerMovedOldGedu(gamer.displayName, productName),
        htmlContent: buildGamerMovedOldGeduEmail({
          geduName: oldGedu.displayName,
          gamerName: gamer.displayName,
          newGeduName: newGedu.displayName,
          productName,
        }),
        cc: adminEmails.filter((e) => e !== oldGedu.email),
        description: `Gamer moved (old gedu) → ${oldGedu.email}`,
      });

      // New gedu
      jobs.push({
        toEmail: newGedu.email,
        subject: groupChangeSubjects.gamerMovedNewGedu(gamer.displayName, productName),
        htmlContent: buildGamerMovedNewGeduEmail({
          geduName: newGedu.displayName,
          gamerName: gamer.displayName,
          oldGeduName: oldGedu.displayName,
          productName,
        }),
        cc: adminEmails.filter((e) => e !== newGedu.email),
        description: `Gamer moved (new gedu) → ${newGedu.email}`,
      });
    }

    // --- Stream SSE ---
    const total = jobs.length;

    if (total === 0) {
      return new Response(
        `data: ${JSON.stringify({ type: "complete", sent: 0, failed: 0, errors: [] })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        },
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let sent = 0;
        let failed = 0;
        const errors: string[] = [];

        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];

          // Progress event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "progress",
                current: i + 1,
                total,
                message: `Notifying ${job.toEmail}...`,
              })}\n\n`,
            ),
          );

          try {
            await sendTransactionalEmail({
              fromEmail: FROM_EMAIL,
              fromName: FROM_NAME,
              toEmail: job.toEmail,
              subject: job.subject,
              htmlContent: job.htmlContent,
              cc: job.cc,
              bcc: job.bcc,
            });
            sent++;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "sent",
                  current: i + 1,
                  total,
                  recipient: job.toEmail,
                })}\n\n`,
              ),
            );
          } catch (err) {
            failed++;
            const msg = `Failed to send to ${job.toEmail}: ${(err as Error).message}`;
            errors.push(msg);
            console.error(msg);
          }
        }

        // Complete event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "complete", sent, failed, errors })}\n\n`,
          ),
        );

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("groups notify route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
