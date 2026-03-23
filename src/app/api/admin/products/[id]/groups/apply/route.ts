import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDailyRoom, deleteDailyRoom } from "@/lib/daily";
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
import type { BatchGroupChanges } from "@/services/groups";
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

interface ApplyBody {
  batch: BatchGroupChanges;
  notify: NotifyPayload;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can manage product groups",
    });
    if (result instanceof NextResponse) return result;

    const { id: productId } = await params;
    const { batch, notify }: ApplyBody = await request.json();

    const admin = createAdminClient();

    // Verify product exists and get name (needed for email templates)
    const { data: product } = await admin
      .from("products")
      .select("id, name")
      .eq("id", productId)
      .single();

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const productName = product.name;

    // --- Resolve profiles for email jobs (before streaming) ---

    const geduIds = new Set<string>();
    const gamerIds = new Set<string>();

    for (const g of notify.addedGroups) geduIds.add(g.geduId);
    for (const g of notify.deletedGroups) geduIds.add(g.geduId);
    for (const g of notify.updatedGroups) {
      geduIds.add(g.oldGeduId);
      geduIds.add(g.newGeduId);
    }
    for (const m of notify.enrollmentMoves) {
      geduIds.add(m.fromGeduId);
      geduIds.add(m.toGeduId);
      gamerIds.add(m.gamerId);
    }
    geduIds.delete("");
    gamerIds.delete("");

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

    const gamerProfiles = new Map<string, { displayName: string }>();
    const gamerParentIds = new Map<string, string>();
    if (gamerIds.size > 0) {
      const { data: gamers } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", Array.from(gamerIds));
      for (const g of gamers ?? []) {
        gamerProfiles.set(g.id, { displayName: g.display_name });
      }

      const { data: enrollments } = await admin
        .from("group_enrollments")
        .select("gamer_id, enrolled_by, product_groups!inner(product_id)")
        .eq("product_groups.product_id", productId)
        .eq("status", "active")
        .in("gamer_id", Array.from(gamerIds));
      for (const e of enrollments ?? []) {
        if (e.enrolled_by) {
          gamerParentIds.set(e.gamer_id, e.enrolled_by);
        }
      }
    }

    const movedGamerIds = new Set(notify.enrollmentMoves.map((m) => m.gamerId));
    const reassignedGroupIds = notify.updatedGroups.map((g) => g.groupId).filter(Boolean);
    const reassignmentParentMap = new Map<string, Map<string, { gamerId: string; parentId: string }>>();

    if (reassignedGroupIds.length > 0) {
      const { data: enrollments } = await admin
        .from("group_enrollments")
        .select("gamer_id, enrolled_by, group_id")
        .eq("status", "active")
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

    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("email")
      .eq("role", "admin");
    const adminEmails: string[] = (adminProfiles ?? [])
      .map((a: { email: string | null }) => a.email)
      .filter((e: string | null): e is string => !!e);

    // --- Build email jobs ---
    const emailJobs: EmailJob[] = [];

    for (const g of notify.addedGroups) {
      const gedu = geduProfiles.get(g.geduId);
      if (!gedu) continue;
      emailJobs.push({
        toEmail: gedu.email,
        subject: groupChangeSubjects.groupAdded(productName),
        htmlContent: buildGroupAddedEmail({ geduName: gedu.displayName, productName }),
        cc: adminEmails.filter((e) => e !== gedu.email),
        description: `Group added → ${gedu.email}`,
      });
    }

    for (const g of notify.deletedGroups) {
      const gedu = geduProfiles.get(g.geduId);
      if (!gedu) continue;
      emailJobs.push({
        toEmail: gedu.email,
        subject: groupChangeSubjects.groupDeleted(productName),
        htmlContent: buildGroupDeletedEmail({ geduName: gedu.displayName, productName }),
        cc: adminEmails.filter((e) => e !== gedu.email),
        description: `Group deleted → ${gedu.email}`,
      });
    }

    for (const g of notify.updatedGroups) {
      const oldGedu = geduProfiles.get(g.oldGeduId);
      const newGedu = geduProfiles.get(g.newGeduId);
      if (!oldGedu || !newGedu) continue;

      emailJobs.push({
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

      emailJobs.push({
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

      const groupEnrollments = reassignmentParentMap.get(g.groupId);
      if (groupEnrollments) {
        for (const { gamerId, parentId } of groupEnrollments.values()) {
          const parent = parentProfiles.get(parentId);
          const gamer = gamerProfiles.get(gamerId);
          if (!parent || !gamer) continue;
          emailJobs.push({
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

    for (const m of notify.enrollmentMoves) {
      const oldGedu = geduProfiles.get(m.fromGeduId);
      const newGedu = geduProfiles.get(m.toGeduId);
      const gamer = gamerProfiles.get(m.gamerId);
      if (!oldGedu || !newGedu || !gamer) continue;

      const parentId = gamerParentIds.get(m.gamerId);
      if (parentId) {
        const parent = parentProfiles.get(parentId);
        if (parent) {
          emailJobs.push({
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

      emailJobs.push({
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

      emailJobs.push({
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

    // --- Prepare DB commit data ---
    const { addedGroups, updatedGroups, deletedGroupIds, enrollmentMoves } = batch;

    let deletedRoomNames: string[] = [];
    if (deletedGroupIds.length > 0) {
      const { data: roomsToDelete } = await admin
        .from("voice_rooms")
        .select("daily_room_name")
        .in("group_id", deletedGroupIds);
      if (roomsToDelete) {
        deletedRoomNames = roomsToDelete.map((r) => r.daily_room_name);
      }
    }

    // --- Stream SSE ---
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const emit = (data: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        // Plan: step 0 = DB save, steps 1..N = email jobs
        emit({
          type: "plan",
          steps: [
            { description: "Save group changes" },
            ...emailJobs.map((j) => ({ description: j.description })),
          ],
        });

        // Step 0: DB commit
        try {
          const { data: rpcResult, error: rpcError } = await admin.rpc(
            "commit_group_changes",
            {
              p_product_id: productId,
              p_added_groups: addedGroups,
              p_updated_groups: updatedGroups,
              p_deleted_group_ids: deletedGroupIds,
              p_enrollment_moves: enrollmentMoves,
            },
          );

          if (rpcError) {
            emit({ type: "step_error", index: 0, error: rpcError.message });
            emit({ type: "complete", success: false, error: rpcError.message });
            controller.close();
            return;
          }

          // Best-effort: pre-create Daily.co rooms for new groups
          const rpcJson = rpcResult as { tempMap?: Record<string, string> } | null;
          const tempMap = rpcJson?.tempMap ?? {};
          for (const realId of Object.values(tempMap)) {
            const dailyRoomName = `group-${realId.slice(0, 8)}`;
            try {
              await createDailyRoom({ name: dailyRoomName });
            } catch (err) {
              console.error(`Failed to pre-create Daily.co room ${dailyRoomName}:`, err);
            }
          }

          // Best-effort: delete Daily.co rooms for deleted groups
          for (const roomName of deletedRoomNames) {
            try {
              await deleteDailyRoom(roomName);
            } catch (err) {
              console.error(`Failed to delete Daily.co room ${roomName}:`, err);
            }
          }

          emit({ type: "step_done", index: 0 });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to save";
          emit({ type: "step_error", index: 0, error: msg });
          emit({ type: "complete", success: false, error: msg });
          controller.close();
          return;
        }

        // Steps 1..N: send emails
        let sent = 0;
        let failed = 0;

        const promises = emailJobs.map((job, i) =>
          sendTransactionalEmail({
            fromEmail: FROM_EMAIL,
            fromName: FROM_NAME,
            toEmail: job.toEmail,
            subject: job.subject,
            htmlContent: job.htmlContent,
            cc: job.cc,
            bcc: job.bcc,
          }).then(
            () => { sent++; emit({ type: "step_done", index: i + 1 }); },
            (err) => {
              failed++;
              const msg = `Failed to send to ${job.toEmail}: ${(err as Error).message}`;
              console.error(msg);
              emit({ type: "step_error", index: i + 1, error: msg });
            },
          ),
        );
        await Promise.all(promises);

        emit({ type: "complete", success: true, sent, failed });
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
    console.error("groups apply route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
