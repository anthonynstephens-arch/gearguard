import "server-only";

const API_VERSION=process.env.SHOPIFY_API_VERSION||"2026-07";
export async function shopifyGraphQL<T>(query:string,variables:Record<string,unknown>={}):Promise<T>{
  const shop=process.env.SHOPIFY_SHOP_DOMAIN?.replace(/^https?:\/\//,"").replace(/\/$/,"");const token=process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;if(!shop||!token)throw new Error("Shopify credentials are not configured");
  const response=await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`,{method:"POST",headers:{"content-type":"application/json","x-shopify-access-token":token},body:JSON.stringify({query,variables}),cache:"no-store"});
  const payload=await response.json();if(!response.ok||payload.errors?.length)throw new Error(payload.errors?.map((item:{message:string})=>item.message).join("; ")||`Shopify returned ${response.status}`);return payload.data as T;
}
export const COMPANIES_QUERY=`#graphql
query GearGuardCompanies($first:Int!,$after:String){companies(first:$first,after:$after,sortKey:NAME){pageInfo{hasNextPage endCursor}nodes{id name locations(first:50){nodes{id name}}}}}`;
export const COMPANY_QUERY=`#graphql
query GearGuardCompany($id:ID!){company(id:$id){id name locations(first:50){nodes{id name}}contacts(first:250){nodes{id title customer{id firstName lastName defaultEmailAddress{emailAddress} state}roleAssignments(first:50){nodes{companyLocation{id name}role{id name}}}}}}}`;
export const PRODUCTS_QUERY=`#graphql
query GearGuardProducts($first:Int!,$after:String,$query:String){products(first:$first,after:$after,query:$query,sortKey:TITLE){pageInfo{hasNextPage endCursor}nodes{id title handle descriptionHtml vendor productType tags status featuredMedia{preview{image{url}}}variants(first:100){nodes{id title sku price inventoryQuantity availableForSale selectedOptions{name value}}}}}}`;
const CREATE_DRAFT=`#graphql
mutation GearGuardDraftOrder($input:DraftOrderInput!){draftOrderCreate(input:$input){draftOrder{id name invoiceUrl status totalPriceSet{shopMoney{amount currencyCode}}}userErrors{field message}}}`;
export async function createDraftOrder({request,items,member,department,allowanceAmount}:{request:Record<string,unknown>;items:Array<Record<string,unknown>>;member:Record<string,unknown>;department:Record<string,unknown>;allowanceAmount:number}){
  const locationId=member.shopify_company_location_id||department.shopify_company_location_id;if(!department.shopify_company_id||!member.shopify_company_contact_id||!locationId)throw new Error("The member and department must be linked to a Shopify B2B company location");
  const input:Record<string,unknown>={email:member.email,purchasingEntity:{purchasingCompany:{companyId:department.shopify_company_id,companyLocationId:locationId,companyContactId:member.shopify_company_contact_id}},note:`GearGuard ${request.request_number}`,tags:["GearGuard",String(request.request_number)],customAttributes:[{key:"GearGuard Request ID",value:String(request.id)}],lineItems:items.map(item=>({variantId:item.shopify_variant_id,quantity:item.quantity}))};
  if(allowanceAmount>0)input.appliedDiscount={title:"GearGuard uniform allowance",description:String(request.request_number),valueType:"FIXED_AMOUNT",value:Number(allowanceAmount.toFixed(2))};
  const data=await shopifyGraphQL<{draftOrderCreate:{draftOrder:Record<string,unknown>|null;userErrors:Array<{field:string[];message:string}>}}>(CREATE_DRAFT,{input});if(data.draftOrderCreate.userErrors.length)throw new Error(data.draftOrderCreate.userErrors.map(item=>item.message).join("; "));if(!data.draftOrderCreate.draftOrder)throw new Error("Shopify did not create the draft order");return data.draftOrderCreate.draftOrder;
}
export function stripHtml(value:string){return value.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()}
export function inferCategory(product:{productType?:string;tags?:string[];title?:string}){const text=`${product.productType||""} ${(product.tags||[]).join(" ")} ${product.title||""}`.toLowerCase();if(text.includes("pant"))return "Pants";if(text.includes("jacket")||text.includes("hood")||text.includes("job shirt"))return "Outerwear";if(text.includes("boot")||text.includes("glove")||text.includes("ppe"))return "Protective Gear";if(text.includes("hat")||text.includes("beanie"))return "Headwear";return "Duty Wear"}
