import { z } from "zod";
import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";
import { ORDER_DETAIL_QUERY, ORDER_LINE_ITEM_DETAILS_QUERY, shopifyGraphQL } from "@/lib/shopify";

const schema=z.object({type:z.enum(["request","historical"]),id:z.string().uuid()});
type ShopifyLineItem={id:string;name:string;quantity:number;sku?:string|null;variantTitle?:string|null;originalUnitPriceSet:{shopMoney:{amount:string;currencyCode:string}};originalTotalSet:{shopMoney:{amount:string;currencyCode:string}};image?:{url:string;altText?:string|null}|null;customAttributes:Array<{key:string;value:string}>};
type ShopifyLineItems={pageInfo:{hasNextPage:boolean;endCursor:string|null};nodes:Array<ShopifyLineItem>};
type ShopifyOrder={order:{id:string;name:string;displayFinancialStatus:string;displayFulfillmentStatus:string;lineItems:ShopifyLineItems}|null};
type ShopifyLineItemPage={order:{lineItems:ShopifyLineItems}|null};

async function loadShopifyOrder(id:string){
  const response=await shopifyGraphQL<ShopifyOrder>(ORDER_DETAIL_QUERY,{id,first:250,after:null});
  if(!response.order)return null;
  let after=response.order.lineItems.pageInfo.endCursor,hasNextPage=response.order.lineItems.pageInfo.hasNextPage;
  while(hasNextPage){
    const page=await shopifyGraphQL<ShopifyLineItemPage>(ORDER_LINE_ITEM_DETAILS_QUERY,{id,first:250,after});
    if(!page.order)throw new ApiError("Shopify order could not be found",404);
    response.order.lineItems.nodes.push(...page.order.lineItems.nodes);
    after=page.order.lineItems.pageInfo.endCursor;
    hasNextPage=page.order.lineItems.pageInfo.hasNextPage;
  }
  return response.order;
}

export async function POST(request:Request){
  try{
    const params=schema.parse(await request.json());
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
    const roster=imported.data.member_id?await admin.from("members").select("first_name,last_name").eq("id",imported.data.member_id).maybeSingle():{data:null,error:null};
    if(roster.error)throw roster.error;
    const attributions=await admin.from("allowance_item_attributions").select("shopify_line_item_id").eq("order_import_id",imported.data.id);
    if(attributions.error)throw attributions.error;
    const shopifyOrder=await loadShopifyOrder(imported.data.shopify_order_id);
    if(!shopifyOrder)throw new ApiError("Shopify order could not be found",404);
    const merchandiseTotal=Number(shopifyOrder.lineItems.nodes.reduce((sum,item)=>sum+Number(item.originalTotalSet.shopMoney.amount),0).toFixed(2));
    if(imported.data.allowance_accounted&&imported.data.account_id){
      const corrected=await admin.rpc("gg_import_shopify_order",{p_account_id:imported.data.account_id,p_shopify_order_id:imported.data.shopify_order_id,p_shopify_order_name:shopifyOrder.name,p_order_created_at:imported.data.order_created_at,p_amount:merchandiseTotal});
      if(corrected.error)throw corrected.error;
    }
    const allowanceAmount=imported.data.allowance_accounted?merchandiseTotal:Number(imported.data.allowance_deducted);
    return Response.json({order:{historicalOrderId:imported.data.id,allowanceAccounted:imported.data.allowance_accounted,attributedLineItemIds:(attributions.data||[]).map(row=>row.shopify_line_item_id),reference:shopifyOrder.name,shopifyReference:shopifyOrder.name,memberName:roster.data?`${roster.data.first_name} ${roster.data.last_name}`.trim():(imported.data.purchaser_name||"Unassigned purchaser"),date:imported.data.order_created_at,status:`${shopifyOrder.displayFinancialStatus} · ${shopifyOrder.displayFulfillmentStatus}`,total:merchandiseTotal,allowanceAmount,personalAmount:Math.max(0,merchandiseTotal-allowanceAmount),source:"Shopify import",lineItems:shopifyOrder.lineItems.nodes.map(item=>({id:item.id,name:item.name,variantTitle:item.variantTitle,sku:item.sku,quantity:item.quantity,unitPrice:Number(item.originalUnitPriceSet.shopMoney.amount),lineTotal:Number(item.originalTotalSet.shopMoney.amount),imageUrl:item.image?.url,properties:item.customAttributes}))}});
  }catch(error){return apiFailure(error)}
}
