import { z } from "zod";
import { apiFailure, requireAppMember } from "@/lib/api-auth";
import { COLLECTIONS_QUERY, shopifyGraphQL } from "@/lib/shopify";

type ShopifyCollection = {
  id: string;
  title: string;
  handle: string;
  updatedAt: string;
  image?: { url?: string } | null;
};

type CollectionsPage = {
  collections: {
    nodes: ShopifyCollection[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

const schema = z.object({
  collections: z
    .array(
      z.object({
        id: z.string().startsWith("gid://shopify/Collection/"),
        title: z.string().min(1).max(255),
        handle: z.string().max(255),
        updatedAt: z.string().datetime(),
        imageUrl: z.string().url().nullable().optional(),
      }),
    )
    .max(250),
});

export async function GET() {
  try {
    const { member, admin } = await requireAppMember(true);
    const collections: ShopifyCollection[] = [];
    let after: string | null = null;

    do {
      const data: CollectionsPage = await shopifyGraphQL<CollectionsPage>(
        COLLECTIONS_QUERY,
        { first: 100, after },
      );
      collections.push(...data.collections.nodes);
      after = data.collections.pageInfo.hasNextPage
        ? data.collections.pageInfo.endCursor
        : null;
    } while (after && collections.length < 2500);

    const assignments = await admin
      .from("department_shopify_collections")
      .select("collection_id,shopify_collections(shopify_collection_id)")
      .eq("department_id", member.department_id);
    if (assignments.error) throw assignments.error;

    const selected = new Set(
      (assignments.data || []).map((row) => {
        const collection = Array.isArray(row.shopify_collections)
          ? row.shopify_collections[0]
          : row.shopify_collections;
        return collection?.shopify_collection_id;
      }),
    );

    return Response.json({
      collections: collections.map((collection) => ({
        ...collection,
        imageUrl: collection.image?.url || null,
        selected: selected.has(collection.id),
      })),
    });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { member, admin } = await requireAppMember(true);

    if (body.collections.length) {
      const upserted = await admin.from("shopify_collections").upsert(
        body.collections.map((collection) => ({
          shopify_collection_id: collection.id,
          title: collection.title,
          handle: collection.handle,
          image_url: collection.imageUrl || null,
          shopify_updated_at: collection.updatedAt,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "shopify_collection_id" },
      );
      if (upserted.error) throw upserted.error;
    }

    const selectedRows = body.collections.length
      ? await admin
          .from("shopify_collections")
          .select("id,shopify_collection_id")
          .in(
            "shopify_collection_id",
            body.collections.map((collection) => collection.id),
          )
      : { data: [], error: null };
    if (selectedRows.error) throw selectedRows.error;

    const selectedIds = (selectedRows.data || []).map((row) => row.id);
    const existingAssignments = await admin
      .from("department_shopify_collections")
      .select("collection_id")
      .eq("department_id", member.department_id);
    if (existingAssignments.error) throw existingAssignments.error;
    if (selectedIds.length) {
      const inserted = await admin
        .from("department_shopify_collections")
        .upsert(
          selectedIds.map((collectionId) => ({
            department_id: member.department_id,
            collection_id: collectionId,
          })),
          { onConflict: "department_id,collection_id", ignoreDuplicates: true },
        );
      if (inserted.error) throw inserted.error;

      const removedIds = (existingAssignments.data || [])
        .map((assignment) => assignment.collection_id)
        .filter((collectionId) => !selectedIds.includes(collectionId));
      if (removedIds.length) {
        const removed = await admin
          .from("department_shopify_collections")
          .delete()
          .eq("department_id", member.department_id)
          .in("collection_id", removedIds);
        if (removed.error) throw removed.error;
      }
    } else {
      const removed = await admin
        .from("department_shopify_collections")
        .delete()
        .eq("department_id", member.department_id);
      if (removed.error) throw removed.error;
    }

    return Response.json({
      success: true,
      collections: selectedRows.data || [],
    });
  } catch (error) {
    return apiFailure(error);
  }
}
