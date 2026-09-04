import "server-only";
import { createServerSupabase } from "./supabase/server";
import { createAdminSupabase } from "./supabase/admin";

export async function requireAppMember(managerOnly=false){
  const session=await createServerSupabase();const {data:{user}}=await session.auth.getUser();if(!user?.email)throw new ApiError("Unauthorized",401);
  const admin=createAdminSupabase();
  let query=await admin.from("members").select("*").eq("auth_user_id",user.id).maybeSingle();
  if(!query.data){query=await admin.from("members").select("*").ilike("email",user.email).maybeSingle();if(query.data&&!query.data.auth_user_id)await admin.from("members").update({auth_user_id:user.id}).eq("id",query.data.id)}
  const member=query.data;if(!member||member.status!=="active")throw new ApiError("An active department membership is required",403);if(managerOnly&&!['manager','admin'].includes(member.role))throw new ApiError("Manager access required",403);
  return {user,member,admin};
}
export class ApiError extends Error{constructor(message:string,public status=400){super(message)}}
export function apiFailure(error:unknown){const message=error instanceof Error?error.message:"Unexpected error";const status=error instanceof ApiError?error.status:500;return Response.json({error:message},{status})}
