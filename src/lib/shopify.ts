import "server-only";

const API_VERSION=process.env.SHOPIFY_API_VERSION||"2026-07";
const DEFAULT_SHOP_DOMAIN="1d974a.myshopify.com";
let cachedAccessToken:{value:string;expiresAt:number}|null=null;
let accessTokenRequest:Promise<string>|null=null;
export function getShopifyShopDomain(){return process.env.SHOPIFY_SHOP_DOMAIN?.replace(/^https?:\/\//,"").replace(/\/$/,"")||DEFAULT_SHOP_DOMAIN}
async function requestShopifyAccessToken(){
  const permanentToken=process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;if(permanentToken)return permanentToken;
  if(cachedAccessToken&&cachedAccessToken.expiresAt>Date.now())return cachedAccessToken.value;
  if(accessTokenRequest)return accessTokenRequest;
  const clientId=process.env.SHOPIFY_CLIENT_ID,clientSecret=process.env.SHOPIFY_CLIENT_SECRET;
  if(!clientId||!clientSecret)throw new Error("Shopify client credentials are not configured");
  const shop=getShopifyShopDomain();
  accessTokenRequest=(async()=>{
    const response=await fetch(`https://${shop}/admin/oauth/access_token`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret}),cache:"no-store"});
    const payload=await response.json() as {access_token?:string;expires_in?:number;error?:string;error_description?:string};
    if(!response.ok||!payload.access_token)throw new Error(payload.error_description||payload.error||`Shopify authentication returned ${response.status}`);
    cachedAccessToken={value:payload.access_token,expiresAt:Date.now()+Math.max(60,(payload.expires_in||86399)-300)*1000};
    return cachedAccessToken.value;
  })();
  try{return await accessTokenRequest}finally{accessTokenRequest=null}
}
export async function shopifyGraphQL<T>(query:string,variables:Record<string,unknown>={}):Promise<T>{
  const shop=getShopifyShopDomain();const token=await requestShopifyAccessToken();
  const response=await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`,{method:"POST",headers:{"content-type":"application/json","x-shopify-access-token":token},body:JSON.stringify({query,variables}),cache:"no-store"});
  const payload=await response.json();if(!response.ok||payload.errors?.length)throw new Error(payload.errors?.map((item:{message:string})=>item.message).join("; ")||`Shopify returned ${response.status}`);return payload.data as T;
}
export const COMPANIES_QUERY=`#graphql
query GearGuardCompanies($first:Int!,$after:String){companies(first:$first,after:$after,sortKey:NAME){pageInfo{hasNextPage endCursor}nodes{id name locations(first:50){nodes{id name}}}}}`;
export const COMPANY_QUERY=`#graphql
query GearGuardCompany($id:ID!){company(id:$id){id name locations(first:50){nodes{id name}}contacts(first:250){nodes{id title customer{id firstName lastName defaultEmailAddress{emailAddress} state}roleAssignments(first:50){nodes{companyLocation{id name}role{id name}}}}}}}`;
export const COLLECTIONS_QUERY=`#graphql
query GearGuardCollections($first:Int!,$after:String){collections(first:$first,after:$after,sortKey:TITLE){pageInfo{hasNextPage endCursor}nodes{id title handle updatedAt image{url}}}}`;
export const COLLECTION_PRODUCTS_QUERY=`#graphql
query GearGuardCollectionProducts($id:ID!,$first:Int!,$after:String){collection(id:$id){id title handle updatedAt image{url} products(first:$first,after:$after,sortKey:TITLE){pageInfo{hasNextPage endCursor}nodes{id title handle descriptionHtml vendor productType tags status featuredImage{url} variants(first:100){nodes{id title sku price inventoryQuantity availableForSale selectedOptions{name value}}}}}}}`;
export const COMPANY_ORDERS_QUERY=`#graphql
query GearGuardCompanyOrders($id:ID!,$first:Int!,$after:String){company(id:$id){orders(first:$first,after:$after,sortKey:CREATED_AT,reverse:true){pageInfo{hasNextPage endCursor}nodes{id name createdAt cancelledAt currentSubtotalPriceSet{shopMoney{amount currencyCode}}purchasingEntity{... on PurchasingCompany{contact{id customer{id defaultEmailAddress{emailAddress}}}}}}}}}}`;
export const APP_SCOPES_QUERY=`#graphql
query GearGuardAppScopes{currentAppInstallation{accessScopes{handle}}}`;
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
