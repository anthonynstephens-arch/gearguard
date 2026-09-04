import { z } from "zod";
import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";

const schema=z.object({
  name:z.string().trim().min(2).max(80),
  description:z.string().trim().max(240).nullable().optional(),
  portalAccess:z.enum(["member","manager","admin"]),
});

export async function POST(request:Request){
  try{
    const body=schema.parse(await request.json());
    const {admin,departmentId}=await requireAppMember(true);
    const duplicate=await admin.from("department_roles").select("id").eq("department_id",departmentId).ilike("name",body.name).maybeSingle();
    if(duplicate.error)throw duplicate.error;
    if(duplicate.data)throw new ApiError("That department role already exists",409);
    const result=await admin.from("department_roles").insert({department_id:departmentId,name:body.name,description:body.description||null,portal_access:body.portalAccess}).select().single();
    if(result.error)throw result.error;
    return Response.json({role:result.data},{status:201});
  }catch(error){return apiFailure(error)}
}
