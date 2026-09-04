import { z } from "zod";
import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";
import { ORDER_DETAIL_QUERY, shopifyGraphQL } from "@/lib/shopify";

const schema=z.object({historicalOrderId:z.string().uuid(),lineItemId:z.string().min(1),memberId:z.string().uuid()});
type ShopifyOrder={order:{lineItems:{nodes:Array<{id:string;name:string;quantity:number;originalTotalSet:{shopMoney:{amount:string}}}>}}|null};

export async function POST(request:Request){
  try{
    const body=schema.parse(await request.json());
    const {admin,departmentId,member:manager}=await requireAppMember(true);
    const imported=await admin.from("shopify_order_imports").select("id,shopify_order_id,allowance_accounted").eq("id",body.historicalOrderId).eq("department_id",departmentId).single();
    if(imported.error)throw new ApiError("Imported order not found",404);
    if(imported.data.allowance_accounted)throw new ApiError("This order was already counted toward an allowance",409);
    const target=await admin.from("members").select("id").eq("id",body.memberId).eq("department_id",departmentId).single();
    if(target.error)throw new ApiError("Member not found",404);
    const account=await admin.from("allowance_accounts").select("id").eq("member_id",body.memberId).eq("department_id",departmentId).single();
    if(account.error)throw new ApiError("Member allowance account not found",404);
    const shopify=await shopifyGraphQL<ShopifyOrder>(ORDER_DETAIL_QUERY,{id:imported.data.shopify_order_id});
    const line=shopify.order?.lineItems.nodes.find(item=>item.id===body.lineItemId);
    if(!line)throw new ApiError("Shopify line item not found",404);
    const result=await admin.rpc("gg_attribute_order_item",{p_order_import_id:body.historicalOrderId,p_account_id:account.data.id,p_manager_id:manager.id,p_shopify_line_item_id:line.id,p_line_item_name:line.name,p_quantity:line.quantity,p_amount:Number(line.originalTotalSet.shopMoney.amount)});
    if(result.error)throw result.error;
    return Response.json({result:result.data});
  }catch(error){return apiFailure(error)}
}
