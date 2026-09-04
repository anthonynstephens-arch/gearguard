import "server-only";
import { demoContext } from "./demo-data";
import type { PortalContext } from "./types";
import { createAdminSupabase } from "./supabase/admin";
import { createServerSupabase } from "./supabase/server";
import { cookies } from "next/headers";

export function isDemoMode(){return process.env.NEXT_PUBLIC_DEMO_MODE==="true"||!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY}

export async function loadPortalContext():Promise<PortalContext|null>{
  if(isDemoMode())return demoContext;
  const session=await createServerSupabase();
  const {data:{user}}=await session.auth.getUser();
  if(!user?.email)return null;
  const admin=createAdminSupabase();
  let {data:member}=await admin.from("members").select("*").eq("auth_user_id",user.id).maybeSingle();
  if(!member){
    const match=await admin.from("members").select("*").ilike("email",user.email).maybeSingle();
    member=match.data;
    if(member&&!member.auth_user_id){const linked=await admin.from("members").update({auth_user_id:user.id}).eq("id",member.id).select().single();member=linked.data;}
  }
  if(!member&&process.env.GEARGUARD_OWNER_EMAIL?.toLowerCase()===user.email.toLowerCase()){
    const count=await admin.from("members").select("id",{count:"exact",head:true});
    if((count.count||0)===0){
      const department=await admin.from("departments").insert({name:process.env.GEARGUARD_DEPARTMENT_NAME||"GearGuard Department",code:process.env.GEARGUARD_DEPARTMENT_CODE||"GG",default_annual_allowance:0,allowance_reset_date:`${new Date().getUTCFullYear()+1}-01-01`}).select().single();
      if(department.error)throw department.error;
      const created=await admin.from("members").insert({auth_user_id:user.id,department_id:department.data.id,first_name:user.user_metadata?.first_name||user.email.split("@")[0],last_name:user.user_metadata?.last_name||"",email:user.email,role:"admin",status:"active"}).select().single();
      if(created.error)throw created.error;
      const account=await admin.from("allowance_accounts").insert({department_id:department.data.id,member_id:created.data.id,annual_amount:0,current_balance:0,reserved_amount:0,spent_amount:0,reset_date:department.data.allowance_reset_date}).select().single();
      if(account.error)throw account.error;member=created.data;
    }
  }
  if(!member)return null;
  const platformOwner=process.env.GEARGUARD_OWNER_EMAIL?.toLowerCase()===user.email.toLowerCase();
  let departmentId=member.department_id;
  const departmentsResult=platformOwner?await admin.from("departments").select("*").order("name"):{data:[],error:null};
  if(departmentsResult.error)throw departmentsResult.error;
  if(platformOwner){const selected=(await cookies()).get("gearguard_department_id")?.value;if(selected&&(departmentsResult.data||[]).some(row=>row.id===selected))departmentId=selected}
  const manager=platformOwner||member.role==="manager"||member.role==="admin";
  const [departmentResult,accountResult,membersResult,accountsResult,assignmentsResult,requestsResult,ledgerResult]=await Promise.all([
    admin.from("departments").select("*").eq("id",departmentId).single(),
    admin.from("allowance_accounts").select("*").eq("member_id",member.id).maybeSingle(),
    manager?admin.from("members").select("*").eq("department_id",departmentId).order("last_name"):admin.from("members").select("*").eq("id",member.id),
    manager?admin.from("allowance_accounts").select("*").eq("department_id",departmentId):admin.from("allowance_accounts").select("*").eq("member_id",member.id),
    admin.from("department_shopify_collections").select("collection_id,shopify_collections(*)").eq("department_id",departmentId),
    manager?admin.from("purchase_requests").select("*").eq("department_id",departmentId).order("submitted_at",{ascending:false}):admin.from("purchase_requests").select("*").eq("member_id",member.id).order("submitted_at",{ascending:false}),
    admin.from("allowance_transactions").select("*").eq("member_id",member.id).order("created_at",{ascending:false}).limit(50),
  ]);
  if(departmentResult.error||accountResult.error)throw departmentResult.error||accountResult.error;
  if(assignmentsResult.error)throw assignmentsResult.error;
  const collections=(assignmentsResult.data||[]).flatMap(row=>Array.isArray(row.shopify_collections)?row.shopify_collections:row.shopify_collections?[row.shopify_collections]:[]);
  const collectionIds=(assignmentsResult.data||[]).map(row=>row.collection_id);
  const memberships=collectionIds.length?await admin.from("product_shopify_collections").select("product_id").in("collection_id",collectionIds):{data:[],error:null};
  if(memberships.error)throw memberships.error;
  const productIds=Array.from(new Set((memberships.data||[]).map(row=>row.product_id)));
  const productsResult=productIds.length?await admin.from("products").select("*").in("id",productIds).eq("active",true).order("title"):{data:[],error:null};
  if(productsResult.error)throw productsResult.error;
  const account=accountResult.data||{id:"",member_id:member.id,annual_amount:0,current_balance:0,reserved_amount:0,spent_amount:0,reset_date:departmentResult.data.allowance_reset_date};
  return {demo:false,platformOwner,departments:platformOwner?(departmentsResult.data||[]):[departmentResult.data],member,department:departmentResult.data,account,members:membersResult.data||[],accounts:accountsResult.data||[],products:(productsResult.data||[]).map(product=>({...product,variants:product.variants||[]})),collections,requests:requestsResult.data||[],ledger:ledgerResult.data||[]};
}
