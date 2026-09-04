import { createServerSupabase } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  return Response.json({ success: true });
}
