import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
function gid(type: string, id: unknown) {
  return String(id || "").startsWith("gid://")
    ? String(id)
    : `gid://shopify/${type}/${id}`;
}
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || "";
  const received = request.headers.get("x-shopify-hmac-sha256") || "";
  const calculated = createHmac("sha256", secret)
    .update(raw, "utf8")
    .digest("base64");
  const a = Buffer.from(received),
    b = Buffer.from(calculated);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b))
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const topic = (request.headers.get("x-shopify-topic") || "")
      .toUpperCase()
      .replaceAll("/", "_");
    const webhookId =
      request.headers.get("x-shopify-webhook-id") || crypto.randomUUID();
    const admin = createAdminSupabase();
    const event = await admin
      .from("shopify_webhook_events")
      .insert({ webhook_id: webhookId, topic, payload, status: "RECEIVED" });
    if (event.error?.code === "23505")
      return Response.json({ ok: true, duplicate: true });
    if (event.error) throw event.error;
    const orderId = payload.id ? gid("Order", payload.id) : null;
    const draftOrderId = payload.draft_order_id
      ? gid("DraftOrder", payload.draft_order_id)
      : null;
    let query = admin.from("purchase_requests").select("*");
    query = orderId
      ? query.eq("shopify_order_id", orderId)
      : draftOrderId
        ? query.eq("shopify_draft_order_id", draftOrderId)
        : query.eq("shopify_order_name", String(payload.name || ""));
    const matched = await query.maybeSingle();
    if (matched.data) {
      const update: Record<string, unknown> = {
        shopify_synced_at: new Date().toISOString(),
        shopify_order_status: topic,
      };
      if (orderId) update.shopify_order_id = orderId;
      if (payload.name) update.shopify_order_name = payload.name;
      if (topic === "FULFILLMENTS_CREATE") {
        update.status = "SHIPPED";
        update.tracking_number =
          payload.tracking_number ||
          (payload.tracking_numbers as string[] | undefined)?.[0] ||
          null;
      } else if (topic === "ORDERS_CANCELLED") update.status = "CANCELLED";
      else if (topic === "ORDERS_CREATE" || topic === "ORDERS_UPDATED")
        update.status = payload.cancelled_at
          ? "CANCELLED"
          : payload.fulfillment_status === "fulfilled"
            ? "COMPLETED"
            : "PROCESSING";
      await admin
        .from("purchase_requests")
        .update(update)
        .eq("id", matched.data.id);
      if (topic === "REFUNDS_CREATE") {
        const transactions = Array.isArray(payload.transactions)
          ? (payload.transactions as Array<Record<string, unknown>>)
          : [];
        const refunded = transactions
          .filter(
            (transaction) =>
              transaction.status !== "failure" &&
              transaction.kind !== "void",
          )
          .reduce(
            (sum, transaction) => sum + Number(transaction.amount || 0),
            0,
          );
        const remaining = Math.max(
          0,
          Number(matched.data.allowance_amount) -
            Number(matched.data.allowance_reversed_amount || 0),
        );
        const allowanceCredit = Math.min(remaining, refunded);
        if (allowanceCredit > 0) {
          const account = await admin
            .from("allowance_accounts")
            .select("id")
            .eq("member_id", matched.data.member_id)
            .single();
          if (account.data) {
            const credited = await admin.rpc("gg_credit_allowance", {
              p_account_id: account.data.id,
              p_amount: allowanceCredit,
              p_request_id: matched.data.id,
              p_reason: `Shopify refund for ${matched.data.shopify_order_name || "order"}`,
            });
            if (credited.error) throw credited.error;
            await admin
              .from("purchase_requests")
              .update({
                allowance_reversed_amount:
                  Number(matched.data.allowance_reversed_amount || 0) +
                  allowanceCredit,
              })
              .eq("id", matched.data.id);
          }
        }
      }
      if (
        topic === "ORDERS_CANCELLED" &&
        Number(matched.data.allowance_amount) >
          Number(matched.data.allowance_reversed_amount || 0)
      ) {
        const amount =
          Number(matched.data.allowance_amount) -
          Number(matched.data.allowance_reversed_amount || 0);
        const account = await admin
          .from("allowance_accounts")
          .select("id")
          .eq("member_id", matched.data.member_id)
          .single();
        if (account.data) {
          await admin.rpc("gg_credit_allowance", {
            p_account_id: account.data.id,
            p_amount: amount,
            p_request_id: matched.data.id,
            p_reason: `Shopify order ${matched.data.shopify_order_name || ""} cancelled`,
          });
          await admin
            .from("purchase_requests")
            .update({
              allowance_reversed_amount: Number(matched.data.allowance_amount),
            })
            .eq("id", matched.data.id);
        }
      }
    }
    await admin
      .from("shopify_webhook_events")
      .update({ status: "PROCESSED", processed_at: new Date().toISOString() })
      .eq("webhook_id", webhookId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Webhook failed" },
      { status: 500 },
    );
  }
}
