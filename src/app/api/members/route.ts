import { z } from "zod";
import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";

const schema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  annualAllowance: z.number().min(0).max(100000),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { member: manager, admin } = await requireAppMember(true);
    const duplicate = await admin
      .from("members")
      .select("id")
      .eq("department_id", manager.department_id)
      .ilike("email", body.email)
      .maybeSingle();
    if (duplicate.data)
      throw new ApiError("A member with that email already exists", 409);

    const created = await admin
      .from("members")
      .insert({
        department_id: manager.department_id,
        first_name: body.firstName,
        last_name: body.lastName,
        email: body.email,
        role: "member",
        status: "active",
      })
      .select()
      .single();
    if (created.error) throw created.error;

    const resetDate = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1))
      .toISOString()
      .slice(0, 10);
    const account = await admin
      .from("allowance_accounts")
      .insert({
        department_id: manager.department_id,
        member_id: created.data.id,
        annual_amount: body.annualAllowance,
        current_balance: body.annualAllowance,
        reset_date: resetDate,
      })
      .select()
      .single();
    if (account.error) {
      await admin.from("members").delete().eq("id", created.data.id);
      throw account.error;
    }
    if (body.annualAllowance > 0) {
      await admin.from("allowance_transactions").insert({
        department_id: manager.department_id,
        member_id: created.data.id,
        account_id: account.data.id,
        manager_id: manager.id,
        type: "ANNUAL_ALLOCATION",
        status: "POSTED",
        amount: body.annualAllowance,
        balance_before: 0,
        balance_after: body.annualAllowance,
        reason: "Initial annual allowance",
      });
    }
    return Response.json(
      { member: created.data, account: account.data },
      { status: 201 },
    );
  } catch (error) {
    return apiFailure(error);
  }
}
