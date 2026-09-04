import { z } from "zod";
import { cookies } from "next/headers";
import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";
const schema=z.object({departmentId:z.string().uuid()});
export async function POST(request:Request){try{const body=schema.parse(await request.json());const {admin,isPlatformOwner}=await requireAppMember(true);if(!isPlatformOwner)throw new ApiError("GearGuard owner access required",403);const department=await admin.from("departments").select("id").eq("id",body.departmentId).single();if(department.error)throw department.error;(await cookies()).set("gearguard_department_id",department.data.id,{httpOnly:true,sameSite:"lax",secure:true,path:"/",maxAge:60*60*24*30});return Response.json({success:true})}catch(error){return apiFailure(error)}}
