# GearGuard

GearGuard is a standalone uniform allowance and gear procurement portal for fire departments and public-safety agencies. It imports people and products from Shopify B2B, tracks per-member allowance balances outside Shopify, routes purchases for approval, creates Shopify draft orders, and maintains an auditable financial ledger.

## Stack

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS
- Supabase Postgres and passwordless authentication
- Shopify Admin GraphQL API and verified webhooks
- Vercel hosting and GitHub Actions checks

## Included workflows

- Shopify B2B company and company-location mapping
- Contact-to-member and product/variant synchronization
- Manager-assigned annual allowances, manual adjustments, and annual resets
- Member catalog, cart, allowance reservation, and personal overage visibility
- Manager approval or denial with reservation release and a durable audit trail
- Shopify B2B draft-order creation after automatic or manager approval
- Fulfillment, cancellation, and refund reconciliation through idempotent webhooks
- Row-level security for member and manager views; all money writes run through server-only atomic database functions

## One-time setup

1. Create a Supabase project and run `supabase/migrations/20260904000000_initial_gearguard_schema.sql`.
2. Copy `.env.example` to `.env.local` and enter the Supabase and Shopify values.
3. In Shopify, create a custom app with these Admin API scopes: `read_companies`, `read_customers`, `read_products`, `read_orders`, `read_fulfillments`, `read_draft_orders`, `write_draft_orders`, and `write_webhooks`.
4. Set `GEARGUARD_OWNER_EMAIL` to the first administrator's email. Their first passwordless login creates the initial department administrator.
5. Deploy to Vercel, set the same environment variables, then open Manager portal → Shopify B2B to select a company, synchronize, and register webhooks.

`NEXT_PUBLIC_DEMO_MODE=true` runs the interactive preview without credentials. Set it to `false` for the connected production portal.

## Local verification

```bash
npm install
npm run check
```

## Environment variables

See `.env.example`. Shopify credentials and the Supabase secret key are only read by server code. Never expose them with a `NEXT_PUBLIC_` prefix.
