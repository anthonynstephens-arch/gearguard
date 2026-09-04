import { z } from "zod";
import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";
import { ORDER_DETAIL_QUERY, shopifyGraphQL } from "@/lib/shopify";

const schema=z.object({type:z.enum(["request","historical"]),id:z.string().uuid()});
type ShopifyOrder={order:{id:string;name:string;displayFinancialStatus:string;displayFulfillmentStatus:string;lineItems:{nodes:Array<{id:string;name:string;quantity:number;sku?:string|null;variantTitle?:string|null;originalUnitPriceSet:{shopMoney:{amount:string;currencyCode:string}};originalTotalSet:{shopMoney:{amount:string;currencyCode:string}};image?:{url:string;altText?:string|null}|null;customAttributes:Array<{key:string;value:string}>}>}}|null};

export async function GET(request:Request){
  try{
    const params=schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const {admin,departmentId,member,isPlatformOwner}=await requireAppMember();
    const manager=isPlatformOwner||member.role==="manager"||member.role==="admin";
    if(params.type==="request"){
      let requestQuery=admin.from("purchase_requests").select("*").eq("id",params.id).eq("department_id",departmentId);
      if(!manager)requestQuery=requestQuery.eq("member_id",member.id);
      const order=await requestQuery.single();if(order.error)throw new ApiError("Order not found",404);
      const items=await admin.from("purchase_items").select("*,products(image_url)").eq("request_id",order.data.id);
      if(items.error)throw items.error;
      return Response.json({order:{reference:order.data.request_number,shopifyReference:order.data.shopify_order_name,memberName:order.data.member_name,date:order.data.submitted_at,status:order.data.status,total:Number(order.data.total_amount),allowanceAmount:Number(order.data.allowance_amount),personalAmount:Number(order.data.personal_amount),source:"GearGuard",lineItems:(items.data||[]).map(item=>({id:item.id,name:item.product_name,variantTitle:item.variant_title,sku:item.sku,quantity:item.quantity,unitPrice:Number(item.unit_price),lineTotal:Number(item.line_total),imageUrl:Array.isArray(item.products)?item.products[0]?.image_url:item.products?.image_url,properties:[]}))}});
    }
    let historyQuery=admin.from("shopify_order_imports").select("*").eq("id",params.id).eq("department_id",departmentId);
    if(!manager)historyQuery=historyQuery.eq("member_id",member.id);
    const imported=await historyQuery.single();if(imported.error)throw new ApiError("Order not found",404);
    const roster=await admin.from("members").select("first_name,last_name").eq("id",imported.data.member_id).single();
    if(roster.error)throw roster.error;
    const shopify=await shopifyGraphQL<ShopifyOrder>(ORDER_DETAIL_QUERY,{id:imported.data.shopify_order_id});
    if(!shopify.order)throw new ApiError("Shopify order could not be found",404);
    return Response.json({order:{reference:shopify.order.name,shopifyReference:shopify.order.name,memberName:`${roster.data.first_name} ${roster.data.last_name}`.trim(),date:imported.data.order_created_at,status:`${shopify.order.displayFinancialStatus} · ${shopify.order.displayFulfillmentStatus}`,total:Number(imported.data.order_amount),allowanceAmount:Number(imported.data.allowance_deducted),personalAmount:Math.max(0,Number(imported.data.order_amount)-Number(imported.data.allowance_deducted)),source:"Shopify import",lineItems:shopify.order.lineItems.nodes.map(item=>({id:item.id,name:item.name,variantTitle:item.variantTitle,sku:item.sku,quantity:item.quantity,unitPrice:Number(item.originalUnitPriceSet.shopMoney.amount),lineTotal:Number(item.originalTotalSet.shopMoney.amount),imageUrl:item.image?.url,properties:item.customAttributes}))}});
  }catch(error){return apiFailure(error)}
}
