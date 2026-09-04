import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";

export async function POST() {
  try {
    const { member: manager, admin, departmentId } = await requireAppMember(true);
    const accounts = await admin
      .from("allowance_accounts")
      .select("id,annual_amount,reserved_amount")
      .eq("department_id", departmentId);
    if (accounts.error) throw accounts.error;
    if (accounts.data.some((account) => Number(account.reserved_amount) > 0)) {
      throw new ApiError(
        "Resolve pending reservations before the annual reset",
        409,
      );
    }
    for (const account of accounts.data) {
      const result = await admin.rpc("gg_adjust_allowance", {
        p_account_id: account.id,
        p_mode: "reset",
        p_amount: Number(account.annual_amount),
        p_reason: "Annual allowance reset",
        p_manager_id: manager.id,
      });
      if (result.error) throw result.error;
    }
    return Response.json({ success: true, reset: accounts.data.length });
  } catch (error) {
    return apiFailure(error);
  }
}
