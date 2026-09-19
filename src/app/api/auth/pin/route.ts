import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  derivePinSessionPassword,
  pinAttemptIdentifier,
  verifyMemberPin,
} from "@/lib/pin-auth";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminSupabase>,
  email: string,
) {
  for (let page = 1; page <= 10; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw result.error;
    const match = result.data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (result.data.users.length < 100) break;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pin?: string };
    const pin = body.pin?.trim() || "";
    if (!/^\d{4,8}$/.test(pin)) {
      return Response.json({ error: "Enter your 4-digit PIN" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const attemptId = pinAttemptIdentifier(request);
    const now = Date.now();
    const attempt = await admin
      .from("pin_login_attempts")
      .select("attempt_count,window_started_at")
      .eq("identifier_hash", attemptId)
      .maybeSingle();
    if (attempt.error) throw attempt.error;

    const windowStarted = attempt.data
      ? new Date(attempt.data.window_started_at).getTime()
      : 0;
    const inWindow = now - windowStarted < ATTEMPT_WINDOW_MS;
    if (inWindow && attempt.data && attempt.data.attempt_count >= MAX_ATTEMPTS) {
      return Response.json(
        { error: "Too many incorrect attempts. Try again in 15 minutes." },
        { status: 429 },
      );
    }

    const credentials = await admin
      .from("member_pin_credentials")
      .select("member_id,pin_hash");
    if (credentials.error) throw credentials.error;

    let memberId: string | null = null;
    for (const credential of credentials.data || []) {
      if (await verifyMemberPin(pin, credential.pin_hash)) {
        if (memberId) {
          return Response.json(
            { error: "This PIN needs to be reset by an administrator." },
            { status: 409 },
          );
        }
        memberId = credential.member_id;
      }
    }

    if (!memberId) {
      const nextCount = inWindow && attempt.data ? attempt.data.attempt_count + 1 : 1;
      const failed = await admin.from("pin_login_attempts").upsert({
        identifier_hash: attemptId,
        attempt_count: nextCount,
        window_started_at: inWindow && attempt.data
          ? attempt.data.window_started_at
          : new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      });
      if (failed.error) throw failed.error;
      return Response.json({ error: "PIN not recognized" }, { status: 401 });
    }

    const memberResult = await admin
      .from("members")
      .select("*")
      .eq("id", memberId)
      .single();
    if (memberResult.error) throw memberResult.error;
    const member = memberResult.data;
    if (member.status !== "active") {
      return Response.json(
        { error: "This member account is not active" },
        { status: 403 },
      );
    }

    const password = derivePinSessionPassword(member.id);
    let authUserId = member.auth_user_id as string | null;
    if (!authUserId) {
      const existingUser = await findAuthUserByEmail(admin, member.email);
      if (existingUser) {
        authUserId = existingUser.id;
        const updated = await admin.auth.admin.updateUserById(authUserId, {
          password,
          email_confirm: true,
        });
        if (updated.error) throw updated.error;
      } else {
        const created = await admin.auth.admin.createUser({
          email: member.email,
          password,
          email_confirm: true,
        });
        if (created.error) throw created.error;
        authUserId = created.data.user.id;
      }
      const linked = await admin
        .from("members")
        .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
        .eq("id", member.id);
      if (linked.error) throw linked.error;
    } else {
      const updated = await admin.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
      });
      if (updated.error) throw updated.error;
    }

    const session = await createServerSupabase();
    const signedIn = await session.auth.signInWithPassword({
      email: member.email,
      password,
    });
    if (signedIn.error) throw signedIn.error;

    await Promise.all([
      admin.from("pin_login_attempts").delete().eq("identifier_hash", attemptId),
      admin
        .from("member_pin_credentials")
        .update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("member_id", member.id),
    ]);

    return Response.json({
      success: true,
      destination: ["manager", "admin"].includes(member.role) ? "/manager" : "/portal",
    });
  } catch (error) {
    console.error("PIN sign-in failed", error);
    return Response.json(
      { error: "PIN sign-in is temporarily unavailable" },
      { status: 500 },
    );
  }
}
