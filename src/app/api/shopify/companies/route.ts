import { apiFailure,requireAppMember } from "@/lib/api-auth";
import { COMPANIES_QUERY,shopifyGraphQL } from "@/lib/shopify";
type CompaniesPage={companies:{nodes:unknown[];pageInfo:{hasNextPage:boolean;endCursor:string|null}}};
export async function GET(){try{await requireAppMember(true);const companies:unknown[]=[];let after:string|null=null;do{const data:CompaniesPage=await shopifyGraphQL<CompaniesPage>(COMPANIES_QUERY,{first:100,after});companies.push(...data.companies.nodes);after=data.companies.pageInfo.hasNextPage?data.companies.pageInfo.endCursor:null}while(after&&companies.length<1000);return Response.json({companies})}catch(error){return apiFailure(error)}}
