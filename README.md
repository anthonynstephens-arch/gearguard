# GearGuard

GearGuard is a standalone uniform allowance and gear procurement portal for fire departments and public-safety agencies. It imports Shopify B2B members, assigns selected Shopify collections to each company, tracks per-member allowance balances outside Shopify, routes purchases for approval, creates Shopify draft orders, and maintains an auditable financial ledger.

## Stack

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS
- Supabase Postgres and passwordless authentication
- Shopify Admin GraphQL API and verified webhooks
- Vercel hosting and GitHub Actions checks

## Included workflows

- Shopify B2B company and company-location mapping
- Contact-to-member synchronization
- Company-specific Shopify collection assignment and product visibility
- Manager-assigned annual allowances, manual adjustments, and annual resets
- Member catalog, cart, allowance reservation, and personal overage visibility
- Manager approval or denial with reservation release and a durable audit trail
- Shopify B2B draft-order creation after automatic or manager approval
- Fulfillment, cancellation, and refund reconciliation through idempotent webhooks
- Row-level security for member and manager views; all money writes run through server-only atomic database functions

## One-time setup

1. Create a Supabase project and run `supabase/migrations/20260904000000_initial_gearguard_schema.sql`.
2. Copy `.env.example` to `.env.local` and enter the Supabase and Shopify Client ID/Client Secret values. GearGuard automatically obtains and caches Shopify's 24-hour access token. `SHOPIFY_ADMIN_ACCESS_TOKEN` remains an optional legacy fallback.
3. In Shopify, create a custom app with these Admin API scopes: `read_companies`, `read_customers`, `read_products`, `read_orders`, `read_all_orders`, `read_fulfillments`, `read_draft_orders`, `write_draft_orders`, and `write_webhooks`. The six-month history import requires `read_all_orders`; without it Shopify only exposes the most recent 60 days.
4. Set `GEARGUARD_OWNER_EMAIL` to the first administrator's email. Their first passwordless login creates the initial department administrator.
5. Deploy to Vercel and set the same environment variables.
6. Open Manager portal → Shopify B2B, select the company and location, load the store's collections, assign the approved collections, synchronize, and register webhooks.

`NEXT_PUBLIC_DEMO_MODE=true` runs the interactive preview without credentials. Set it to `false` for the connected production portal.

## Local verification

```bash
npm install
npm run check
```

## Environment variables

See `.env.example`. Shopify credentials and the Supabase secret key are only read by server code. Never expose them with a `NEXT_PUBLIC_` prefix.
