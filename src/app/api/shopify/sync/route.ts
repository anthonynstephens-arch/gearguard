import { apiFailure, ApiError, requireAppMember } from "@/lib/api-auth";
import {
  COLLECTION_PRODUCTS_QUERY,
  COMPANY_QUERY,
  getShopifyShopDomain,
  inferCategory,
  shopifyGraphQL,
  stripHtml,
} from "@/lib/shopify";

type CompanyContact = {
  id: string;
  customer?: {
    id: string;
    firstName?: string;
    lastName?: string;
    defaultEmailAddress?: { emailAddress?: string };
    state: string;
  };
  roleAssignments: { nodes: Array<{ companyLocation?: { id: string } }> };
};
type CompanyData = {
  company: {
    id: string;
    name: string;
    locations: { nodes: Array<{ id: string; name: string }> };
    contacts: { nodes: CompanyContact[] };
  } | null;
};
type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  featuredImage?: { url?: string } | null;
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      sku: string;
      price: string;
      inventoryQuantity: number;
      availableForSale: boolean;
      selectedOptions: Array<{ name: string; value: string }>;
    }>;
  };
};
type CollectionProductsPage = {
  collection: {
    id: string;
    title: string;
    handle: string;
    updatedAt: string;
    image?: { url?: string } | null;
    products: {
      nodes: ShopifyProduct[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
};

export const maxDuration=60;
const chunks=<T,>(items:T[],size:number)=>Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,(index+1)*size));

export async function POST() {
  try {
    const { admin, departmentId } = await requireAppMember(true);
    const departmentResult = await admin
      .from("departments")
      .select("*")
      .eq("id", departmentId)
      .single();
    if (departmentResult.error) throw departmentResult.error;
    const department = departmentResult.data;
    if (!department.shopify_company_id)
      throw new ApiError("Select a Shopify B2B company first");

    await admin
      .from("departments")
      .update({ shopify_sync_status: "SYNCING", shopify_sync_error: null })
      .eq("id", department.id);

    const companyData = await shopifyGraphQL<CompanyData>(COMPANY_QUERY, {
      id: department.shopify_company_id,
    });
    if (!companyData.company)
      throw new ApiError("Shopify company was not found", 404);

    let membersCreated = 0;
    let membersUpdated = 0;
    for (const contact of companyData.company.contacts.nodes) {
      const customer = contact.customer;
      const email = customer?.defaultEmailAddress?.emailAddress?.toLowerCase();
      if (!customer || !email) continue;
      const locationId =
        contact.roleAssignments.nodes.find((item) => item.companyLocation)
          ?.companyLocation?.id ||
        department.shopify_company_location_id ||
        companyData.company.locations.nodes[0]?.id ||
        null;
      let existing = await admin
        .from("members")
        .select("*")
        .eq("shopify_company_contact_id", contact.id)
        .maybeSingle();
      if (!existing.data)
        existing = await admin
          .from("members")
          .select("*")
          .ilike("email", email)
          .maybeSingle();
      const payload = {
        department_id: department.id,
        email,
        first_name: customer.firstName || existing.data?.first_name || "Member",
        last_name: customer.lastName || existing.data?.last_name || "",
        status: customer.state === "DISABLED" ? "inactive" : "active",
        shopify_customer_id: customer.id,
        shopify_company_contact_id: contact.id,
        shopify_company_location_id: locationId,
        shopify_synced_at: new Date().toISOString(),
      };
      if (existing.data) {
        const updated = await admin
          .from("members")
          .update(payload)
          .eq("id", existing.data.id);
        if (updated.error) throw updated.error;
        membersUpdated++;
      } else {
        const created = await admin
          .from("members")
          .insert({ ...payload, role: "member" })
          .select()
          .single();
        if (created.error) throw created.error;
        const account = await admin.from("allowance_accounts").insert({
          department_id: department.id,
          member_id: created.data.id,
          annual_amount: department.default_annual_allowance || 0,
          current_balance: 0,
          reserved_amount: 0,
          spent_amount: 0,
          reset_date: department.allowance_reset_date,
        });
        if (account.error) throw account.error;
        membersCreated++;
      }
    }

    const assignments = await admin
      .from("department_shopify_collections")
      .select("collection_id")
      .eq("department_id", department.id);
    if (assignments.error) throw assignments.error;
    const collectionIds = (assignments.data || []).map(
      (assignment) => assignment.collection_id,
    );
    const collectionRows = collectionIds.length
      ? await admin
          .from("shopify_collections")
          .select("*")
          .in("id", collectionIds)
      : { data: [], error: null };
    if (collectionRows.error) throw collectionRows.error;

    const syncedProductIds = new Set<string>();
    for (const collectionRow of collectionRows.data || []) {
      const products: ShopifyProduct[] = [];
      let after: string | null = null;
      let shopifyCollection: NonNullable<CollectionProductsPage["collection"]> | null = null;
      do {
        const data: CollectionProductsPage =
          await shopifyGraphQL<CollectionProductsPage>(
            COLLECTION_PRODUCTS_QUERY,
            { id: collectionRow.shopify_collection_id, first: 100, after },
          );
        if (!data.collection)
          throw new ApiError(
            `Shopify collection ${collectionRow.title} was not found`,
            404,
          );
        shopifyCollection = data.collection;
        products.push(...data.collection.products.nodes);
        after = data.collection.products.pageInfo.hasNextPage
          ? data.collection.products.pageInfo.endCursor
          : null;
      } while (after && products.length < 5000);
      if (!shopifyCollection) continue;

      const collectionUpdate = await admin
        .from("shopify_collections")
        .update({
          title: shopifyCollection.title,
          handle: shopifyCollection.handle,
          image_url: shopifyCollection.image?.url || null,
          shopify_updated_at: shopifyCollection.updatedAt,
          shopify_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", collectionRow.id);
      if (collectionUpdate.error) throw collectionUpdate.error;

      const cleared = await admin
        .from("product_shopify_collections")
        .delete()
        .eq("collection_id", collectionRow.id);
      if (cleared.error) throw cleared.error;
      const productMemberships: Array<{
        product_id: string;
        collection_id: string;
      }> = [];

      const activeProducts=products.filter(product=>product.status==="ACTIVE"&&product.variants.nodes.length>0);
      for(const batch of chunks(activeProducts,50)){
        const existing=await admin.from("products").select("*").in("shopify_product_id",batch.map(product=>product.id));
        if(existing.error)throw existing.error;
        const existingByShopifyId=new Map((existing.data||[]).map(product=>[product.shopify_product_id,product]));
        const payloads=batch.map(product=>{
          const previous=existingByShopifyId.get(product.id);
          const variants=product.variants.nodes.map(variant=>({id:variant.id,title:variant.title,sku:variant.sku||"",price:Number(variant.price),inventory_quantity:variant.inventoryQuantity,available:variant.availableForSale,selected_options:variant.selectedOptions}));
          return{title:product.title,description:stripHtml(product.descriptionHtml||""),category:previous?.category||inferCategory(product),image_url:product.featuredImage?.url||previous?.image_url||null,price:Math.min(...variants.map(item=>item.price)),allowance_eligible:previous?.allowance_eligible??true,approval_required:previous?.approval_required??false,active:true,shopify_product_id:product.id,shopify_handle:product.handle,shopify_vendor:product.vendor,shopify_product_type:product.productType,shopify_tags:product.tags,variants,shopify_synced_at:new Date().toISOString()};
        });
        const saved=await admin.from("products").upsert(payloads,{onConflict:"shopify_product_id"}).select("id,shopify_product_id");
        if(saved.error)throw saved.error;
        for(const product of saved.data||[]){syncedProductIds.add(product.id);productMemberships.push({product_id:product.id,collection_id:collectionRow.id})}
      }
      for(const batch of chunks(productMemberships,500)){
        const linked=await admin.from("product_shopify_collections").upsert(batch,{onConflict:"product_id,collection_id",ignoreDuplicates:true});
        if(linked.error)throw linked.error;
      }
    }

    const now = new Date().toISOString();
    const departmentUpdate = await admin
      .from("departments")
      .update({
        shopify_company_name: companyData.company.name,
        shopify_company_location_id:
          department.shopify_company_location_id ||
          companyData.company.locations.nodes[0]?.id,
        shopify_shop_domain: getShopifyShopDomain(),
        shopify_sync_status: "CONNECTED",
        shopify_last_sync_at: now,
        shopify_sync_error: null,
      })
      .eq("id", department.id);
    if (departmentUpdate.error) throw departmentUpdate.error;
    const run = await admin.from("shopify_sync_runs").insert({
      department_id: department.id,
      status: "SUCCESS",
      members_created: membersCreated,
      members_updated: membersUpdated,
      products_synced: syncedProductIds.size,
      finished_at: now,
    });
    if (run.error) throw run.error;

    return Response.json({
      success: true,
      members: { created: membersCreated, updated: membersUpdated },
      collections: { synced: collectionRows.data?.length || 0 },
      products: { synced: syncedProductIds.size },
      lastSync: now,
    });
  } catch (error) {
    return apiFailure(error);
  }
}
