import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";
import { APP_SCOPES_QUERY, COMPANY_ORDERS_QUERY, shopifyGraphQL } from "@/lib/shopify";

type OrderPage={company:{orders:{pageInfo:{hasNextPage:boolean;endCursor:string|null};nodes:Array<{id:string;name:string;createdAt:string;cancelledAt?:string|null;currentSubtotalPriceSet:{shopMoney:{amount:string;currencyCode:string}};purchasingEntity?:{contact?:{id:string;customer?:{id:string;defaultEmailAddress?:{emailAddress:string}|null}|null}|null}|null}>}}|null};

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
    let imported=0,duplicates=0,ordersFound=0,unmatched=0,amountDeducted=0,after:string|null=null,finished=false;
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
        if(!member){unmatched++;continue}
        const account=await admin.from("allowance_accounts").select("id").eq("member_id",member.id).single();
        if(account.error)throw account.error;
        const amount=Number(order.currentSubtotalPriceSet.shopMoney.amount);
        const result=await admin.rpc("gg_import_shopify_order",{p_account_id:account.data.id,p_shopify_order_id:order.id,p_shopify_order_name:order.name,p_order_created_at:order.createdAt,p_amount:amount});
        if(result.error)throw result.error;
        const value=result.data as {imported:boolean;deducted:number};
        if(value.imported){imported++;amountDeducted+=Number(value.deducted||0)}else duplicates++;
      }
      after=!finished&&page.company.orders.pageInfo.hasNextPage?page.company.orders.pageInfo.endCursor:null;
    }while(after);
    return Response.json({success:true,membersScanned:members.data.length,ordersFound,imported,duplicates,unmatched,amountDeducted:Number(amountDeducted.toFixed(2)),cutoff:cutoff.toISOString(),fullHistory,warning:fullHistory?null:"Shopify has not granted read_all_orders, so only the most recent 60 days were available."});
  }catch(error){return apiFailure(error)}
}
