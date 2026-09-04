import type { PortalContext } from "./types";

const departmentId = "demo-department";
const rawMembers = [
  ["member-1","Jordan","Ellis","Firefighter / Paramedic","4271","7","B","manager","linked"],
  ["member-2","Maya","Thompson","Lieutenant","3814","3","A","member","linked"],
  ["member-3","Chris","Williams","Firefighter","4490","12","C","member","linked"],
  ["member-4","Riley","Brooks","Captain","2961","7","B","manager","linked"],
  ["member-5","Avery","Martin","Firefighter / EMT","4522","5","A","member","manual"],
  ["member-6","Cameron","Diaz","Battalion Chief","2108","HQ","D","manager","linked"],
] as const;

export const demoContext: PortalContext = {
  demo:true,
  department:{ id:departmentId,name:"Metro Fire & Rescue",code:"MFR",fiscal_year:"2026",approval_required:true,approval_threshold:150,allow_personal_overage:true,shopify_shop_domain:"your-store.myshopify.com",shopify_company_id:"gid://shopify/Company/1001",shopify_company_name:"Metro Fire & Rescue",shopify_sync_status:"CONNECTED",shopify_last_sync_at:"2026-09-04T18:42:00Z" },
  member:{ id:"member-1",department_id:departmentId,first_name:"Jordan",last_name:"Ellis",email:"jordan@metrofire.example",badge_number:"4271",rank:"Firefighter / Paramedic",station:"7",platoon:"B",role:"manager",status:"active",shopify_company_contact_id:"gid://shopify/CompanyContact/1001" },
  account:{ id:"allowance-1",member_id:"member-1",annual_amount:500,current_balance:314.5,reserved_amount:82,spent_amount:185.5,reset_date:"2027-01-01" },
  members:rawMembers.map(([id,first,last,rank,badge,station,platoon,role,link])=>({ id,department_id:departmentId,first_name:first,last_name:last,email:`${first.toLowerCase()}@metrofire.example`,badge_number:badge,rank,station,platoon,role,status:"active",shopify_company_contact_id:link==="linked"?`gid://shopify/CompanyContact/${id}`:null })),
  accounts:[
    ["allowance-1","member-1",500,314.5,82,185.5],["allowance-2","member-2",500,119.25,0,380.75],["allowance-3","member-3",375,375,0,0],
    ["allowance-4","member-4",600,48.75,35,551.25],["allowance-5","member-5",375,227,0,148],["allowance-6","member-6",750,522.4,0,227.6],
  ].map(([id,member_id,annual,current,reserved,spent])=>({ id:String(id),member_id:String(member_id),annual_amount:Number(annual),current_balance:Number(current),reserved_amount:Number(reserved),spent_amount:Number(spent),reset_date:"2027-01-01" })),
  products:[
    { id:"product-1",title:"Performance Duty Polo",description:"Moisture-wicking station polo",category:"Duty Wear",price:46,allowance_eligible:true,approval_required:false,active:true,shopify_product_id:"gid://shopify/Product/1",variants:["S","M","L","XL","2XL"].map((title,index)=>({id:`gid://shopify/ProductVariant/1${index}`,title,sku:`MFR-POLO-${title}`,price:title==="2XL"?49:46,available:true})) },
    { id:"product-2",title:"Job Shirt — Quarter Zip",description:"Heavyweight job shirt with department embroidery",category:"Outerwear",price:82,allowance_eligible:true,approval_required:false,active:true,shopify_product_id:"gid://shopify/Product/2",variants:["M","L","XL","2XL"].map((title,index)=>({id:`gid://shopify/ProductVariant/2${index}`,title,sku:`MFR-JOB-${title}`,price:title==="2XL"?85:82,available:true})) },
    { id:"product-3",title:"Station Work Pants",description:"Professional uniform pants with reinforced knees",category:"Pants",price:71.5,allowance_eligible:true,approval_required:false,active:true,shopify_product_id:"gid://shopify/Product/3",variants:["32×30","34×30","34×32","36×32"].map((title,index)=>({id:`gid://shopify/ProductVariant/3${index}`,title,sku:`MFR-PANT-${index}`,price:71.5,available:true})) },
    { id:"product-4",title:"Structural Glove Set",description:"NFPA-rated replacement gloves",category:"Protective Gear",price:128,allowance_eligible:true,approval_required:true,active:true,shopify_product_id:"gid://shopify/Product/4",variants:["M","L","XL"].map((title,index)=>({id:`gid://shopify/ProductVariant/4${index}`,title,sku:`MFR-GLOVE-${title}`,price:128,available:true})) },
  ],
  collections:[
    {id:"collection-1",shopify_collection_id:"gid://shopify/Collection/1001",title:"Metro Fire Uniform Store",handle:"metro-fire-uniform-store",shopify_synced_at:"2026-09-04T18:42:00Z"},
    {id:"collection-2",shopify_collection_id:"gid://shopify/Collection/1002",title:"Approved Duty Gear",handle:"approved-duty-gear",shopify_synced_at:"2026-09-04T18:42:00Z"},
  ],
  requests:[
    {id:"request-1",request_number:"GG-260904-8C2F",member_id:"member-1",member_name:"Jordan Ellis",status:"PENDING_APPROVAL",total_amount:82,allowance_amount:82,personal_amount:0,submitted_at:"2026-09-04T16:24:00Z"},
    {id:"request-2",request_number:"GG-260902-40A1",member_id:"member-2",member_name:"Maya Thompson",status:"SHIPPED",total_amount:142.5,allowance_amount:142.5,personal_amount:0,submitted_at:"2026-09-02T13:10:00Z",shopify_order_name:"#1844",tracking_number:"1Z72A03E0391452266"},
    {id:"request-3",request_number:"GG-260831-1B77",member_id:"member-4",member_name:"Riley Brooks",status:"PENDING_APPROVAL",total_amount:163,allowance_amount:163,personal_amount:0,submitted_at:"2026-08-31T19:42:00Z"},
    {id:"request-4",request_number:"GG-260829-93D0",member_id:"member-1",member_name:"Jordan Ellis",status:"COMPLETED",total_amount:92,allowance_amount:92,personal_amount:0,submitted_at:"2026-08-29T14:05:00Z",shopify_order_name:"#1831"},
  ],
  ledger:[
    {id:"txn-1",type:"RESERVATION",amount:-82,balance_after:232.5,reason:"Reserved for GG-260904-8C2F",created_at:"2026-09-04T16:24:00Z"},
    {id:"txn-2",type:"PURCHASE",amount:-92,balance_after:314.5,reason:"Shopify order #1831",created_at:"2026-08-29T14:08:00Z"},
    {id:"txn-3",type:"MANUAL_CREDIT",amount:35,balance_after:406.5,reason:"Boot replacement authorization",created_at:"2026-08-12T11:30:00Z"},
    {id:"txn-4",type:"PURCHASE",amount:-128.5,balance_after:371.5,reason:"Shopify order #1802",created_at:"2026-07-19T18:15:00Z"},
  ],
};
