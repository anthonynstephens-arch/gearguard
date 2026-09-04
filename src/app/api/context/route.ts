import { loadPortalContext } from "@/lib/context";
export async function GET(){const context=await loadPortalContext();return context?Response.json(context):Response.json({error:"Unauthorized"},{status:401})}
