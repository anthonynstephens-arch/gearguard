import { z } from "zod";
import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";
import { createDraftOrder } from "@/lib/shopify";
const schema = z.object({
  decision: z.enum(["APPROVE", "DENY"]),
  approvedItemIds: z.array(z.string().uuid()).optional(),
  notes: z.string().max(2000).optional(),
  denialReason: z.string().max(2000).optional(),
});
export async function POST(
  request: Request,
  context: RouteContext<"/api/approvals/[id]">,
) {
  try {
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    const { member: manager, admin } = await requireAppMember(true);
    const requestRow = await admin
      .from("purchase_requests")
      .select("*")
      .eq("id", id)
      .single();
    if (requestRow.error) throw requestRow.error;
    const purchase = requestRow.data;
    if (purchase.department_id !== manager.department_id)
      throw new ApiError(
        "You cannot approve another department's request",
        403,
      );
    if (purchase.status !== "PENDING_APPROVAL")
      throw new ApiError(
        `This request is already ${purchase.status.toLowerCase()}`,
        409,
      );
    const [memberResult, departmentResult, accountResult, itemsResult] =
      await Promise.all([
        admin.from("members").select("*").eq("id", purchase.member_id).single(),
        admin
          .from("departments")
          .select("*")
          .eq("id", purchase.department_id)
          .single(),
        admin
          .from("allowance_accounts")
          .select("*")
          .eq("member_id", purchase.member_id)
          .single(),
        admin.from("purchase_items").select("*").eq("request_id", purchase.id),
      ]);
    if (
      memberResult.error ||
      departmentResult.error ||
      accountResult.error ||
      itemsResult.error
    )
      throw (
        memberResult.error ||
        departmentResult.error ||
        accountResult.error ||
        itemsResult.error
      );
    const items = itemsResult.data;
    const approvedIds = new Set(
      body.approvedItemIds?.length
        ? body.approvedItemIds
        : items.map((item) => item.id),
    );
    const approvedItems = items.filter((item) => approvedIds.has(item.id));
    const reserved = Number(purchase.reserved_allowance_amount || 0);
    if (body.decision === "DENY" || !approvedItems.length) {
      if (!body.denialReason) throw new ApiError("A denial reason is required");
      if (reserved > 0) {
        const released = await admin.rpc("gg_release_allowance", {
          p_account_id: accountResult.data.id,
          p_amount: reserved,
          p_request_id: purchase.id,
          p_reason: `Denied ${purchase.request_number}: ${body.denialReason}`,
        });
        if (released.error) throw released.error;
      }
      await admin
        .from("purchase_items")
        .update({ approved: false, denial_reason: body.denialReason })
        .eq("request_id", purchase.id);
      await admin
        .from("purchase_requests")
        .update({
          status: "DENIED",
          reserved_allowance_amount: 0,
          manager_id: manager.id,
          manager_name: `${manager.first_name} ${manager.last_name}`,
          denial_reason: body.denialReason,
          approval_notes: body.notes || null,
          decided_at: new Date().toISOString(),
        })
        .eq("id", purchase.id);
      await admin
        .from("approval_actions")
        .insert({
          department_id: purchase.department_id,
          request_id: purchase.id,
          manager_id: manager.id,
          action: "DENY",
          notes: body.denialReason,
        });
      return Response.json({ success: true, status: "DENIED" });
    }
    const approvedTotal = Number(
      approvedItems
        .reduce((sum, item) => sum + Number(item.line_total), 0)
        .toFixed(2),
    );
    const allowanceApplied = Math.min(approvedTotal, reserved);
    const draft = await createDraftOrder({
      request: purchase,
      items: approvedItems,
      member: memberResult.data,
      department: departmentResult.data,
      allowanceAmount: allowanceApplied,
    });
    if (reserved > 0) {
      const committed = await admin.rpc("gg_commit_reservation", {
        p_account_id: accountResult.data.id,
        p_reserved: reserved,
        p_charge: allowanceApplied,
        p_request_id: purchase.id,
        p_reason: `Approved ${purchase.request_number}; Shopify draft ${String(draft.name)}`,
      });
      if (committed.error) throw committed.error;
    }
    const deniedIds = items
      .filter((item) => !approvedIds.has(item.id))
      .map((item) => item.id);
    if (deniedIds.length) {
      await admin
        .from("purchase_items")
        .update({
          approved: false,
          denial_reason: body.denialReason || body.notes || "Not approved",
        })
        .in("id", deniedIds);
    }
    await admin
      .from("purchase_items")
      .update({ approved: true, denial_reason: null })
      .in("id", [...approvedIds]);
    const updated = await admin
      .from("purchase_requests")
      .update({
        status: "ORDERED",
        total_amount: approvedTotal,
        allowance_amount: allowanceApplied,
        reserved_allowance_amount: 0,
        personal_amount: Math.max(0, approvedTotal - allowanceApplied),
        manager_id: manager.id,
        manager_name: `${manager.first_name} ${manager.last_name}`,
        approval_notes: body.notes || null,
        denial_reason:
          approvedItems.length < items.length
            ? body.denialReason || body.notes
            : null,
        decided_at: new Date().toISOString(),
        shopify_draft_order_id: draft.id,
        shopify_order_name: draft.name,
        shopify_invoice_url: draft.invoiceUrl,
        shopify_order_status: draft.status,
        shopify_synced_at: new Date().toISOString(),
      })
      .eq("id", purchase.id)
      .select()
      .single();
    if (updated.error) throw updated.error;
    await admin
      .from("approval_actions")
      .insert({
        department_id: purchase.department_id,
        request_id: purchase.id,
        manager_id: manager.id,
        action:
          approvedItems.length === items.length ? "APPROVE" : "PARTIAL_APPROVE",
        notes: body.notes || body.denialReason,
      });
    return Response.json({
      success: true,
      status: "ORDERED",
      checkoutUrl: draft.invoiceUrl,
    });
  } catch (error) {
    return apiFailure(error);
  }
}
