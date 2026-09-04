import { apiFailure,requireAppMember } from "@/lib/api-auth";
import { shopifyGraphQL } from "@/lib/shopify";
const LIST=`#graphql query GearGuardWebhooks($first:Int!){webhookSubscriptions(first:$first){nodes{id topic uri}}}`;
const CREATE=`#graphql mutation GearGuardWebhook($topic:WebhookSubscriptionTopic!,$webhookSubscription:WebhookSubscriptionInput!){webhookSubscriptionCreate(topic:$topic,webhookSubscription:$webhookSubscription){webhookSubscription{id topic uri}userErrors{field message}}}`;
const topics=["ORDERS_CREATE","ORDERS_UPDATED","ORDERS_CANCELLED","REFUNDS_CREATE","FULFILLMENTS_CREATE"];
function webhookUri(request:Request,callbackUrl:unknown){
  const appUrl=process.env.NEXT_PUBLIC_APP_URL?.trim();
  const productionHost=process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const forwardedHost=request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const candidates=[
    typeof callbackUrl==="string"?callbackUrl.trim():"",
    appUrl?`${appUrl.replace(/\/$/,"")}/api/shopify/webhook`:"",
    productionHost?`https://${productionHost}/api/shopify/webhook`:"",
    forwardedHost?`https://${forwardedHost}/api/shopify/webhook`:"",
    `${new URL(request.url).origin}/api/shopify/webhook`,
  ];
  for(const candidate of candidates){
    if(!candidate)continue;
    try{const url=new URL(candidate);if(url.protocol==="https:")return url.toString().replace(/\/$/,"")}catch{}
  }
  throw new Error("Shopify requires an HTTPS webhook URL");
}
export async function POST(request:Request){try{await requireAppMember(true);const body=await request.json().catch(()=>({}));const uri=webhookUri(request,body.callbackUrl);const listed=await shopifyGraphQL<{webhookSubscriptions:{nodes:Array<{id:string;topic:string;uri:string}>}}>(LIST,{first:250});const results=[];for(const topic of topics){const found=listed.webhookSubscriptions.nodes.find(item=>item.topic===topic&&item.uri===uri);if(found){results.push({...found,existing:true});continue}const data=await shopifyGraphQL<{webhookSubscriptionCreate:{webhookSubscription:unknown;userErrors:Array<{message:string}>}}>(CREATE,{topic,webhookSubscription:{uri}});if(data.webhookSubscriptionCreate.userErrors.length)throw new Error(data.webhookSubscriptionCreate.userErrors.map(item=>item.message).join("; "));results.push(data.webhookSubscriptionCreate.webhookSubscription)}return Response.json({success:true,callbackUrl:uri,webhooks:results})}catch(error){return apiFailure(error)}}
