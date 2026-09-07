import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";
import { APP_SCOPES_QUERY, COMPANY_ORDERS_QUERY, ORDER_LINE_ITEMS_QUERY, shopifyGraphQL } from "@/lib/shopify";

type MoneySet={shopMoney:{amount:string;currencyCode:string}};
type LineItems={pageInfo:{hasNextPage:boolean;endCursor:string|null};nodes:Array<{originalTotalSet:MoneySet}>};
type OrderNode={id:string;name:string;createdAt:string;cancelledAt?:string|null;lineItems:LineItems;purchasingEntity?:{contact?:{id:string;customer?:{id:string;firstName?:string|null;lastName?:string|null;defaultEmailAddress?:{emailAddress:string}|null}|null}|null}|null};
type OrderPage={company:{orders:{pageInfo:{hasNextPage:boolean;endCursor:string|null};nodes:Array<OrderNode>}}|null};
type LineItemPage={order:{lineItems:LineItems}|null};

function sumLineItems(lineItems:LineItems){return lineItems.nodes.reduce((total,item)=>total+Number(item.originalTotalSet.shopMoney.amount),0)}
async function orderLineItemAmount(order:OrderNode){
  let total=sumLineItems(order.lineItems),after=order.lineItems.pageInfo.endCursor,hasNextPage=order.lineItems.pageInfo.hasNextPage;
  while(hasNextPage){
    const page=await shopifyGraphQL<LineItemPage>(ORDER_LINE_ITEMS_QUERY,{id:order.id,first:250,after});
    if(!page.order)throw new ApiError(`Shopify order ${order.name} could not be found`);
    total+=sumLineItems(page.order.lineItems);
    hasNextPage=page.order.lineItems.pageInfo.hasNextPage;
    after=page.order.lineItems.pageInfo.endCursor;
  }
  return Number(total.toFixed(2));
}

export const maxDuration=60;

export async function POST(){
  try{
    const {admin,departmentId}=await requireAppMember(true);
    const department=await admin.from("departments").select("shopify_company_id").eq("id",departmentId).single();
    if(department.error)throw department.error;
    if(!department.data.shopify_company_id)throw new ApiError("Connect a Shopify B2B company first");
    const scopes=await shopifyGraphQL<{currentAppInstallation:{accessScopes:Array<{handle:string}>}}>(APP_SCOPES_QUERY);
    const fullHistory=scopes.currentAppInstallation.accessScopes.some(scope=>scope.handle==="read_all_orders");
    const members=await admin.from("members").select("id,email,shopify_customer_id,shopify_company_contact_id").eq("department_id",departmentId);
    if(members.error)throw members.error;
    const managedOrders=await admin.from("purchase_requests").select("shopify_order_id,shopify_order_name").eq("department_id",departmentId);
    if(managedOrders.error)throw managedOrders.error;
    const managedOrderIds=new Set(managedOrders.data.map(order=>order.shopify_order_id).filter(Boolean));
    const managedOrderNames=new Set(managedOrders.data.map(order=>order.shopify_order_name).filter(Boolean));
    const memberByContact=new Map(members.data.filter(member=>member.shopify_company_contact_id).map(member=>[member.shopify_company_contact_id,member]));
    const memberByCustomer=new Map(members.data.filter(member=>member.shopify_customer_id).map(member=>[member.shopify_customer_id,member]));
    const memberByEmail=new Map(members.data.map(member=>[member.email.toLowerCase(),member]));
    const cutoff=new Date();cutoff.setUTCMonth(cutoff.getUTCMonth()-6);
    let imported=0,adjusted=0,duplicates=0,ordersFound=0,unmatched=0,amountDeducted=0,amountRestored=0,after:string|null=null,finished=false;
    do{
      const page:OrderPage=await shopifyGraphQL<OrderPage>(COMPANY_ORDERS_QUERY,{id:department.data.shopify_company_id,first:100,after});
      if(!page.company)throw new ApiError("The connected Shopify company could not be found");
      for(const order of page.company.orders.nodes){
        const created=new Date(order.createdAt);
        if(created<cutoff){finished=true;break}
        if(order.cancelledAt)continue;
        ordersFound++;
        if(managedOrderIds.has(order.id)||managedOrderNames.has(order.name)){duplicates++;continue}
        const contact=order.purchasingEntity?.contact;
        const email=contact?.customer?.defaultEmailAddress?.emailAddress?.toLowerCase();
        const member=(contact?.id&&memberByContact.get(contact.id))||(contact?.customer?.id&&memberByCustomer.get(contact.customer.id))||(email&&memberByEmail.get(email));
        const purchaserName=[contact?.customer?.firstName,contact?.customer?.lastName].filter(Boolean).join(" ")||email||"Unassigned purchaser";
        const amount=await orderLineItemAmount(order);
        if(!member){
          unmatched++;
          const saved=await admin.from("shopify_order_imports").upsert({department_id:departmentId,member_id:null,account_id:null,shopify_order_id:order.id,shopify_order_name:order.name,order_created_at:order.createdAt,order_amount:amount,allowance_deducted:0,purchaser_name:purchaserName,allowance_accounted:false},{onConflict:"department_id,shopify_order_id",ignoreDuplicates:true});
          if(saved.error)throw saved.error;
          continue
        }
        const account=await admin.from("allowance_accounts").select("id").eq("member_id",member.id).single();
        if(account.error)throw account.error;
        const result=await admin.rpc("gg_import_shopify_order",{p_account_id:account.data.id,p_shopify_order_id:order.id,p_shopify_order_name:order.name,p_order_created_at:order.createdAt,p_amount:amount});
        if(result.error)throw result.error;
        const value=result.data as {imported:boolean;adjusted?:boolean;deducted:number;restored?:number};
        if(value.imported){imported++;amountDeducted+=Number(value.deducted||0)}else if(value.adjusted){adjusted++;amountDeducted+=Number(value.deducted||0);amountRestored+=Number(value.restored||0)}else duplicates++;
      }
      after=!finished&&page.company.orders.pageInfo.hasNextPage?page.company.orders.pageInfo.endCursor:null;
    }while(after);
    return Response.json({success:true,membersScanned:members.data.length,ordersFound,imported,adjusted,duplicates,unmatched,amountDeducted:Number(amountDeducted.toFixed(2)),amountRestored:Number(amountRestored.toFixed(2)),cutoff:cutoff.toISOString(),fullHistory,warning:fullHistory?null:"Shopify has not granted read_all_orders, so only the most recent 60 days were available."});
  }catch(error){return apiFailure(error)}
}
