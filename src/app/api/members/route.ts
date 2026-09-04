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

const updateSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().transform((value) => value.toLowerCase()),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  employeeId: z.string().trim().max(100).nullable(),
  badgeNumber: z.string().trim().max(100).nullable(),
  rank: z.string().trim().max(100).nullable(),
  station: z.string().trim().max(100).nullable(),
  platoon: z.string().trim().max(100).nullable(),
  role: z.enum(["member", "manager", "admin"]),
  status: z.enum(["active", "inactive", "leave"]),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { member: manager, admin, departmentId } = await requireAppMember(true);
    const duplicate = await admin
      .from("members")
      .select("id")
      .eq("department_id", departmentId)
      .ilike("email", body.email)
      .maybeSingle();
    if (duplicate.data)
      throw new ApiError("A member with that email already exists", 409);

    const created = await admin
      .from("members")
      .insert({
        department_id: departmentId,
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
        department_id: departmentId,
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
        department_id: departmentId,
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

export async function PATCH(request: Request) {
  try {
    const body = updateSchema.parse(await request.json());
    const { member: manager, admin, isPlatformOwner, departmentId } =
      await requireAppMember(true);
    const existing = await admin
      .from("members")
      .select("id,auth_user_id")
      .eq("id", body.id)
      .eq("department_id", departmentId)
      .single();
    if (existing.error) throw new ApiError("Member not found", 404);
    if (
      !isPlatformOwner &&
      manager.id === body.id &&
      (body.status !== "active" || body.role === "member")
    )
      throw new ApiError("You cannot remove your own manager access");
    const duplicate = await admin
      .from("members")
      .select("id")
      .eq("department_id", departmentId)
      .ilike("email", body.email)
      .neq("id", body.id)
      .maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data)
      throw new ApiError("A member with that email already exists", 409);
    if (existing.data.auth_user_id) {
      const authUpdate = await admin.auth.admin.updateUserById(
        existing.data.auth_user_id,
        { email: body.email },
      );
      if (authUpdate.error) throw authUpdate.error;
    }
    const updated = await admin
      .from("members")
      .update({
        first_name: body.firstName,
        last_name: body.lastName,
        email: body.email,
        employee_id: body.employeeId || null,
        badge_number: body.badgeNumber || null,
        rank: body.rank || null,
        station: body.station || null,
        platoon: body.platoon || null,
        role: body.role,
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.id)
      .eq("department_id", departmentId)
      .select()
      .single();
    if (updated.error) throw updated.error;
    return Response.json({ member: updated.data });
  } catch (error) {
    return apiFailure(error);
  }
}
