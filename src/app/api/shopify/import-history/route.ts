import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";
import { APP_SCOPES_QUERY, CUSTOMER_ORDERS_QUERY, shopifyGraphQL } from "@/lib/shopify";

type OrderPage={customer:{orders:{pageInfo:{hasNextPage:boolean;endCursor:string|null};nodes:Array<{id:string;name:string;createdAt:string;cancelledAt?:string|null;currentSubtotalPriceSet:{shopMoney:{amount:string;currencyCode:string}}}>}}|null};

export async function POST(){
  try{
    const {admin,departmentId}=await requireAppMember(true);
    const department=await admin.from("departments").select("shopify_company_id").eq("id",departmentId).single();
    if(department.error)throw department.error;
    if(!department.data.shopify_company_id)throw new ApiError("Connect a Shopify B2B company first");
    const scopes=await shopifyGraphQL<{currentAppInstallation:{accessScopes:Array<{handle:string}>}}>(APP_SCOPES_QUERY);
    const fullHistory=scopes.currentAppInstallation.accessScopes.some(scope=>scope.handle==="read_all_orders");
    const members=await admin.from("members").select("id,shopify_customer_id").eq("department_id",departmentId).not("shopify_customer_id","is",null);
    if(members.error)throw members.error;
    const cutoff=new Date();cutoff.setUTCMonth(cutoff.getUTCMonth()-6);
    let imported=0,duplicates=0,ordersFound=0,amountDeducted=0;
    for(const member of members.data){
      const account=await admin.from("allowance_accounts").select("id").eq("member_id",member.id).single();
      if(account.error)throw account.error;
      let after:string|null=null,finished=false;
      do{
        const page:OrderPage=await shopifyGraphQL<OrderPage>(CUSTOMER_ORDERS_QUERY,{id:member.shopify_customer_id,first:100,after});
        if(!page.customer)break;
        for(const order of page.customer.orders.nodes){
          const created=new Date(order.createdAt);
          if(created<cutoff){finished=true;break}
          if(order.cancelledAt)continue;
          ordersFound++;
          const amount=Number(order.currentSubtotalPriceSet.shopMoney.amount);
          const result=await admin.rpc("gg_import_shopify_order",{p_account_id:account.data.id,p_shopify_order_id:order.id,p_shopify_order_name:order.name,p_order_created_at:order.createdAt,p_amount:amount});
          if(result.error)throw result.error;
          const value=result.data as {imported:boolean;deducted:number};
          if(value.imported){imported++;amountDeducted+=Number(value.deducted||0)}else duplicates++;
        }
        after=!finished&&page.customer.orders.pageInfo.hasNextPage?page.customer.orders.pageInfo.endCursor:null;
      }while(after);
    }
    return Response.json({success:true,membersScanned:members.data.length,ordersFound,imported,duplicates,amountDeducted:Number(amountDeducted.toFixed(2)),cutoff:cutoff.toISOString(),fullHistory,warning:fullHistory?null:"Shopify has not granted read_all_orders, so only the most recent 60 days were available."});
  }catch(error){return apiFailure(error)}
}
