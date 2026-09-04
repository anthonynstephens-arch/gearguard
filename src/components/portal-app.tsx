"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CloudCog,
  DollarSign,
  History,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import type { PortalContext, Product } from "@/lib/types";

const money = (value: number | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value || 0,
  );
const date = (value: string | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "—";
const statusClass = (status: string) =>
  `status status-${status.toLowerCase().replaceAll("_", "-")}`;

type CartLine = { product: Product; variantId: string; quantity: number };
type ShopifyCompany = {
  id: string;
  name: string;
  locations: { nodes: Array<{ id: string; name: string }> };
};
type ShopifyStoreCollection = {
  id: string;
  title: string;
  handle: string;
  updatedAt: string;
  imageUrl?: string | null;
  selected: boolean;
};

export function PortalApp({
  context,
  mode,
}: {
  context: PortalContext;
  mode: "member" | "manager";
}) {
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [accounts, setAccounts] = useState(context.accounts);
  const [members, setMembers] = useState(context.members);
  const [requests, setRequests] = useState(context.requests);
  const [companies, setCompanies] = useState<ShopifyCompany[]>([]);
  const [collectionOptions, setCollectionOptions] = useState<
    ShopifyStoreCollection[]
  >(
    context.collections.map((collection) => ({
      id: collection.shopify_collection_id,
      title: collection.title,
      handle: collection.handle,
      updatedAt: collection.shopify_synced_at || new Date().toISOString(),
      imageUrl: collection.image_url,
      selected: true,
    })),
  );
  const [companyId, setCompanyId] = useState(
    context.department.shopify_company_id || "",
  );
  const [locationId, setLocationId] = useState(
    context.department.shopify_company_location_id || "",
  );
  useEffect(()=>{
    setMembers(context.members);setAccounts(context.accounts);setRequests(context.requests);
    setCompanyId(context.department.shopify_company_id||"");setLocationId(context.department.shopify_company_location_id||"");
    setCollectionOptions(context.collections.map((collection)=>({id:collection.shopify_collection_id,title:collection.title,handle:collection.handle,updatedAt:collection.shopify_synced_at||new Date().toISOString(),imageUrl:collection.image_url,selected:true})));
  },[context]);
  const available = Math.max(
    0,
    context.account.current_balance - context.account.reserved_amount,
  );
  const categories = [
    "All",
    ...Array.from(new Set(context.products.map((product) => product.category))),
  ];
  const filteredProducts = context.products.filter(
    (product) =>
      (category === "All" || product.category === category) &&
      (!query || product.title.toLowerCase().includes(query.toLowerCase())),
  );
  const cartTotal = cart.reduce((sum, line) => {
    const variant = line.product.variants.find(
      (item) => item.id === line.variantId,
    );
    return sum + (variant?.price || line.product.price) * line.quantity;
  }, 0);
  const pending = requests.filter(
    (request) => request.status === "PENDING_APPROVAL",
  );
  const nav =
    mode === "manager"
      ? [
          ["overview", "Command dashboard", LayoutDashboard],
          ["members", "Members", Users],
          ["allowances", "Allowances", WalletCards],
          ["approvals", "Approvals", ClipboardCheck],
          ["orders", "Orders", Package],
          ["shopify", "Shopify B2B", Store],
        ]
      : [
          ["overview", "Dashboard", LayoutDashboard],
          ["shop", "Shop gear", ShoppingBag],
          ["orders", "My orders", Package],
          ["allowance", "My allowance", WalletCards],
        ];
  function add(product: Product) {
    const variant =
      product.variants.find((item) => item.available) || product.variants[0];
    if (!variant) return;
    setCart((lines) => {
      const found = lines.find(
        (line) =>
          line.product.id === product.id && line.variantId === variant.id,
      );
      return found
        ? lines.map((line) =>
            line === found ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [...lines, { product, variantId: variant.id, quantity: 1 }];
    });
    setNotice(`${product.title} added to cart`);
  }
  async function submitCart() {
    setBusy(true);
    try {
      if (!context.demo) {
        const response = await fetch("/api/purchases", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientRequestId: crypto.randomUUID(),
            items: cart.map((line) => ({
              productId: line.product.id,
              variantId: line.variantId,
              quantity: line.quantity,
            })),
          }),
        });
        if (!response.ok)
          throw new Error((await response.json()).error || "Checkout failed");
      }
      setNotice(
        cartTotal > context.department.approval_threshold
          ? "Request submitted for manager approval"
          : "Order created in Shopify",
      );
      setCart([]);
      setCartOpen(false);
      setTab("orders");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }
  async function adjust(
    memberId: string,
    accountId: string,
    modeName: "credit" | "debit" | "set",
  ) {
    const raw = window.prompt(
      `${modeName === "credit" ? "Add credit" : modeName === "debit" ? "Deduct" : "Set balance"} amount`,
    );
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0)
      return setNotice("Enter a valid amount");
    const reason =
      window.prompt("Reason for the audit ledger") || "Manager adjustment";
    setBusy(true);
    try {
      if (!context.demo) {
        const response = await fetch("/api/allowances/adjust", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ memberId, mode: modeName, amount, reason }),
        });
        if (!response.ok)
          throw new Error((await response.json()).error || "Adjustment failed");
      }
      setAccounts((rows) =>
        rows.map((account) =>
          account.id !== accountId
            ? account
            : {
                ...account,
                current_balance:
                  modeName === "set"
                    ? Math.max(account.reserved_amount, amount-account.spent_amount)
                    : modeName === "credit"
                      ? account.current_balance + amount
                      : Math.max(
                          account.reserved_amount,
                          account.current_balance - amount,
                        ),
                annual_amount: modeName === "set" ? amount : account.annual_amount,
              },
        ),
      );
      setNotice("Allowance updated and ledger entry recorded");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Adjustment failed");
    } finally {
      setBusy(false);
    }
  }
  async function syncShopify() {
    setBusy(true);
    try {
      if (!context.demo) {
        const response = await fetch("/api/shopify/sync", { method: "POST" });
        if (!response.ok)
          throw new Error((await response.json()).error || "Sync failed");
      }
      setNotice(
        "Shopify members and assigned collections imported successfully",
      );
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }
  async function importPurchaseHistory(){
    if(!window.confirm("Import each linked member's Shopify purchases from the last six months and deduct them from assigned allowances? Orders already imported will be skipped."))return;
    setBusy(true);
    try{
      if(context.demo){setNotice("Historical purchases imported; duplicate orders were skipped");return}
      const response=await fetch("/api/shopify/import-history",{method:"POST"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Purchase history import failed");
      setNotice(`${data.imported} orders imported for ${data.membersScanned} members; ${money(data.amountDeducted)} deducted from available balances${data.warning?` — ${data.warning}`:""}`);
      router.refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Purchase history import failed")}finally{setBusy(false)}
  }
  async function loadCompanies() {
    setBusy(true);
    try {
      if (context.demo) {
        setCompanies([
          {
            id: "gid://shopify/Company/1001",
            name: "Metro Fire & Rescue",
            locations: {
              nodes: [
                {
                  id: "gid://shopify/CompanyLocation/1001",
                  name: "Headquarters",
                },
                { id: "gid://shopify/CompanyLocation/1002", name: "Station 7" },
              ],
            },
          },
        ]);
        setNotice("Shopify companies loaded");
        return;
      }
      const response = await fetch("/api/shopify/companies");
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load companies");
      setCompanies(data.companies);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load companies",
      );
    } finally {
      setBusy(false);
    }
  }
  async function connectCompany() {
    const company = companies.find((item) => item.id === companyId);
    if (!company || !locationId)
      return setNotice("Select a company and location");
    setBusy(true);
    try {
      if (!context.demo) {
        const response = await fetch("/api/shopify/connect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyId,
            companyName: company.name,
            locationId,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Connection failed");
      }
      setNotice(`${company.name} connected to GearGuard`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }
  async function viewDepartment(departmentId:string){
    setBusy(true);
    try{
      const response=await fetch("/api/departments/view-as",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({departmentId})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not switch department");
      setNotice("Department view changed");router.refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Could not switch department")}finally{setBusy(false)}
  }
  async function loadCollections() {
    setBusy(true);
    try {
      if (context.demo) {
        setCollectionOptions([
          {
            id: "gid://shopify/Collection/1001",
            title: "Metro Fire Uniform Store",
            handle: "metro-fire-uniform-store",
            updatedAt: new Date().toISOString(),
            selected: true,
          },
          {
            id: "gid://shopify/Collection/1002",
            title: "Approved Duty Gear",
            handle: "approved-duty-gear",
            updatedAt: new Date().toISOString(),
            selected: true,
          },
          {
            id: "gid://shopify/Collection/1003",
            title: "Public Store Apparel",
            handle: "public-store-apparel",
            updatedAt: new Date().toISOString(),
            selected: false,
          },
        ]);
        setNotice("Shopify collections loaded");
        return;
      }
      const response = await fetch("/api/shopify/collections");
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load collections");
      setCollectionOptions(data.collections);
      setNotice("Shopify collections loaded");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load collections",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveCollections() {
    const selectedCollections = collectionOptions.filter(
      (collection) => collection.selected,
    );
    setBusy(true);
    try {
      if (!context.demo) {
        const response = await fetch("/api/shopify/collections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ collections: selectedCollections }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Collection assignment failed");
      }
      setNotice(
        `${selectedCollections.length} ${selectedCollections.length === 1 ? "collection" : "collections"} assigned to this company`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Collection assignment failed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function registerWebhooks() {
    setBusy(true);
    try {
      if (!context.demo) {
        const response = await fetch("/api/shopify/register-webhooks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Webhook registration failed");
        setNotice(`${data.webhooks.length} Shopify webhooks are active`);
      } else setNotice("Five Shopify webhooks registered");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Webhook registration failed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function decide(requestId: string, decision: "APPROVE" | "DENY") {
    const row = requests.find((item) => item.id === requestId);
    const denialReason =
      decision === "DENY" ? window.prompt("Reason for denial") || "" : "";
    if (decision === "DENY" && !denialReason) return;
    setBusy(true);
    try {
      if (!context.demo) {
        const response = await fetch(`/api/approvals/${requestId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision,
            denialReason: denialReason || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Decision failed");
      }
      setRequests((rows) =>
        rows.map((item) =>
          item.id === requestId
            ? { ...item, status: decision === "APPROVE" ? "ORDERED" : "DENIED" }
            : item,
        ),
      );
      setNotice(
        decision === "APPROVE"
          ? `${row?.request_number || "Request"} approved and sent to Shopify`
          : `${row?.request_number || "Request"} denied; reservation released`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }
  async function addMember() {
    const email = window.prompt("Member email address")?.trim().toLowerCase();
    if (!email) return;
    const firstName = window.prompt("First name")?.trim();
    const lastName = window.prompt("Last name")?.trim();
    if (!firstName || !lastName)
      return setNotice("First and last name are required");
    const allowance = Number(window.prompt("Annual allowance", "500") || 0);
    if (!Number.isFinite(allowance) || allowance < 0)
      return setNotice("Enter a valid allowance");
    setBusy(true);
    try {
      let created = {
        id: crypto.randomUUID(),
        department_id: context.department.id,
        first_name: firstName,
        last_name: lastName,
        email,
        role: "member",
        status: "active",
      } as PortalContext["member"];
      let account = {
        id: crypto.randomUUID(),
        member_id: created.id,
        annual_amount: allowance,
        current_balance: allowance,
        reserved_amount: 0,
        spent_amount: 0,
        reset_date: new Date(new Date().getFullYear() + 1, 0, 1).toISOString(),
      };
      if (!context.demo) {
        const response = await fetch("/api/members", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            firstName,
            lastName,
            annualAllowance: allowance,
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Member creation failed");
        created = data.member;
        account = data.account;
      }
      setMembers((rows) => [created, ...rows]);
      setAccounts((rows) => [account, ...rows]);
      setNotice(`${firstName} ${lastName} added`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Member creation failed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resetAllowances() {
    if (
      !window.confirm(
        "Reset every member to their assigned annual allowance? This creates an audit entry for each account.",
      )
    )
      return;
    setBusy(true);
    try {
      if (!context.demo) {
        const response = await fetch("/api/allowances/reset", {
          method: "POST",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Reset failed");
      }
      setAccounts((rows) =>
        rows.map((account) => ({
          ...account,
          current_balance: account.annual_amount,
          reserved_amount: 0,
          spent_amount: 0,
        })),
      );
      setNotice("Annual allowances reset and audit entries recorded");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }
  async function assignAllAllowances(){
    const raw=window.prompt("Annual allowance to assign to every member","500");if(raw===null)return;
    const amount=Number(raw);if(!Number.isFinite(amount)||amount<0)return setNotice("Enter a valid allowance");
    if(!window.confirm(`Assign ${money(amount)} annually to all ${accounts.length} members? Imported purchases will remain deducted.`))return;
    setBusy(true);try{if(!context.demo){const response=await fetch("/api/allowances/assign-all",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({amount})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Allowance assignment failed")}
      setAccounts(rows=>rows.map(account=>({...account,annual_amount:amount,current_balance:Math.max(account.reserved_amount,amount-account.spent_amount)})));
      setNotice(`${money(amount)} annual allowance assigned to ${accounts.length} members`);router.refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Allowance assignment failed")}finally{setBusy(false)}
  }
  async function signOut() {
    setBusy(true);
    try {
      if (!context.demo) await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  }
  const page = mode === "manager" ? managerPage() : memberPage();
  function memberPage() {
    if (tab === "shop") return <Shop />;
    if (tab === "orders") return <Orders personal />;
    if (tab === "allowance") return <Allowance />;
    return <MemberOverview />;
  }
  function managerPage() {
    if (tab === "members") return <Members />;
    if (tab === "allowances") return <Allowances />;
    if (tab === "approvals") return <Approvals />;
    if (tab === "orders") return <Orders />;
    if (tab === "shopify") return <Shopify />;
    return <ManagerOverview />;
  }

  function MemberOverview() {
    const usedPct = Math.min(
      100,
      (context.account.spent_amount / context.account.annual_amount) * 100,
    );
    return (
      <>
        <PageHead
          eyebrow="Member portal"
          title={`Welcome back, ${context.member.first_name}`}
          subtitle={`${context.member.rank} · Badge ${context.member.badge_number} · Station ${context.member.station}`}
        />
        <div className="balance-hero">
          <div>
            <span>Available uniform allowance</span>
            <strong>{money(available)}</strong>
            <p>
              {money(context.account.reserved_amount)} reserved in pending
              requests
            </p>
          </div>
          <div
            className="balance-ring"
            style={
              { "--percent": `${usedPct * 3.6}deg` } as React.CSSProperties
            }
          >
            <span>{usedPct.toFixed(0)}%</span>
            <small>used</small>
          </div>
        </div>
        <div className="quick-grid">
          <Quick
            icon={ShoppingBag}
            title="Shop approved gear"
            text="Browse your department catalog"
            action={() => setTab("shop")}
          />
          <Quick
            icon={Package}
            title="Track orders"
            text="See fulfillment and tracking"
            action={() => setTab("orders")}
          />
          <Quick
            icon={History}
            title="Review allowance"
            text="Open the complete ledger"
            action={() => setTab("allowance")}
          />
        </div>
        <section className="card">
          <SectionHead
            title="Recent activity"
            link="Full ledger"
            action={() => setTab("allowance")}
          />
          <Ledger compact />
        </section>
      </>
    );
  }
  function ManagerOverview() {
    const allocated = accounts.reduce(
        (sum, account) => sum + account.annual_amount,
        0,
      ),
      remaining = accounts.reduce(
        (sum, account) =>
          sum + Math.max(0, account.current_balance - account.reserved_amount),
        0,
      ),
      spent = accounts.reduce((sum, account) => sum + account.spent_amount, 0);
    return (
      <>
        <PageHead
          eyebrow="Department command"
          title="Uniform program overview"
          subtitle={`${context.department.name} · Fiscal year ${context.department.fiscal_year}`}
        />
        <div className="stat-grid">
          <Stat
            label="Active members"
            value={String(members.filter((m) => m.status === "active").length)}
            meta={`${members.filter((m) => m.shopify_company_contact_id).length} Shopify linked`}
            icon={Users}
          />
          <Stat
            label="Allowance allocated"
            value={money(allocated)}
            meta={`${money(remaining)} available`}
            icon={WalletCards}
          />
          <Stat
            label="Allowance spent"
            value={money(spent)}
            meta={`${Math.round((spent / allocated) * 100)}% utilization`}
            icon={Activity}
          />
          <Stat
            label="Pending approvals"
            value={String(pending.length)}
            meta={money(
              pending.reduce((sum, item) => sum + item.total_amount, 0),
            )}
            icon={ClipboardCheck}
            accent
          />
        </div>
        <div className="dashboard-grid">
          <section className="card">
            <SectionHead
              title="Requests needing action"
              link="Review all"
              action={() => setTab("approvals")}
            />
            <RequestList requests={pending.slice(0, 4)} />
          </section>
          <section className="card">
            <SectionHead
              title="Allowance health"
              link="Manage"
              action={() => setTab("allowances")}
            />
            <div className="health-list">
              {accounts.slice(0, 5).map((account) => {
                const member = members.find(
                  (item) => item.id === account.member_id,
                );
                const pct = Math.max(
                  0,
                  ((account.current_balance - account.reserved_amount) /
                    account.annual_amount) *
                    100,
                );
                return (
                  <div key={account.id}>
                    <div>
                      <span>
                        {member?.first_name} {member?.last_name}
                      </span>
                      <b>
                        {money(
                          account.current_balance - account.reserved_amount,
                        )}
                      </b>
                    </div>
                    <div className="progress">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </>
    );
  }
  function Shop() {
    return (
      <>
        <PageHead
          eyebrow="Department catalog"
          title="Shop approved gear"
          subtitle={`${money(available)} available · Prices and inventory synchronized from Shopify`}
          action={
            <button
              className="button button-dark"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag size={17} /> Cart (
              {cart.reduce((sum, line) => sum + line.quantity, 0)})
            </button>
          }
        />
        <div className="catalog-tools">
          <div className="search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search uniforms and gear"
            />
          </div>
          <div className="category-row">
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? "active" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="product-grid">
          {filteredProducts.map((product) => (
            <article className="product-card" key={product.id}>
              <div
                className={
                  product.image_url
                    ? "product-visual has-image"
                    : "product-visual"
                }
                style={
                  product.image_url
                    ? {
                        backgroundImage: `linear-gradient(#0b22331a,#0b22331a),url(${product.image_url})`,
                      }
                    : undefined
                }
              >
                {!product.image_url && <ShoppingBag size={34} />}{" "}
                {product.approval_required && (
                  <span>
                    <AlertTriangle size={12} /> Approval
                  </span>
                )}
              </div>
              <div className="product-info">
                <small>{product.category}</small>
                <h3>{product.title}</h3>
                <p>{product.description}</p>
                <div>
                  <b>{money(product.price)}</b>
                  <button onClick={() => add(product)}>
                    Add <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </>
    );
  }
  function Orders({ personal = false }: { personal?: boolean }) {
    const rows = personal
      ? requests.filter((request) => request.member_id === context.member.id)
      : requests;
    return (
      <>
        <PageHead
          eyebrow={personal ? "Member history" : "Order operations"}
          title={personal ? "My orders & requests" : "All department orders"}
          subtitle="Shopify fulfillment and GearGuard approval status in one view"
        />
        <section className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Request</th>
                {!personal && <th>Member</th>}
                <th>Date</th>
                <th>Status</th>
                <th>Shopify</th>
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((request) => (
                <tr key={request.id}>
                  <td>
                    <b>{request.request_number}</b>
                  </td>
                  {!personal && <td>{request.member_name}</td>}
                  <td>{date(request.submitted_at)}</td>
                  <td>
                    <span className={statusClass(request.status)}>
                      {request.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>{request.shopify_order_name || "—"}</td>
                  <td className="right">
                    <b>{money(request.total_amount)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
    );
  }
  function Allowance() {
    return (
      <>
        <PageHead
          eyebrow="Financial ledger"
          title="My allowance"
          subtitle={`Resets ${date(context.account.reset_date)}`}
        />
        <div className="stat-grid three">
          <Stat
            label="Annual allowance"
            value={money(context.account.annual_amount)}
            meta="Current fiscal year"
            icon={WalletCards}
          />
          <Stat
            label="Available now"
            value={money(available)}
            meta={`${money(context.account.reserved_amount)} reserved`}
            icon={DollarSign}
          />
          <Stat
            label="Spent"
            value={money(context.account.spent_amount)}
            meta={`${((context.account.spent_amount / context.account.annual_amount) * 100).toFixed(0)}% utilized`}
            icon={Activity}
          />
        </div>
        <section className="card">
          <SectionHead title="Complete allowance ledger" />
          <Ledger />
        </section>
      </>
    );
  }
  function Members() {
    const rows = members.filter((member) =>
      `${member.first_name} ${member.last_name} ${member.email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    return (
      <>
        <PageHead
          eyebrow="Roster management"
          title="Department members"
          subtitle="Shopify B2B contacts and manually managed members"
          action={
            <button
              className="button button-dark"
              disabled={busy}
              onClick={addMember}
            >
              + Add member
            </button>
          }
        />
        <div className="search-box standalone">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, badge, or email"
          />
        </div>
        <section className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Assignment</th>
                <th>Shopify</th>
                <th>Status</th>
                <th className="right">Available</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => {
                const account = accounts.find(
                  (item) => item.member_id === member.id,
                );
                return (
                  <tr key={member.id}>
                    <td>
                      <div className="person">
                        <span>
                          {member.first_name[0]}
                          {member.last_name[0]}
                        </span>
                        <div>
                          <b>
                            {member.first_name} {member.last_name}
                          </b>
                          <small>
                            {member.rank} · Badge {member.badge_number}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      Station {member.station} · {member.platoon}
                    </td>
                    <td>
                      <span
                        className={
                          member.shopify_company_contact_id
                            ? "linked"
                            : "manual"
                        }
                      >
                        {member.shopify_company_contact_id
                          ? "Linked"
                          : "Manual"}
                      </span>
                    </td>
                    <td>
                      <span className="status status-active">
                        {member.status}
                      </span>
                    </td>
                    <td className="right">
                      <b>
                        {money(
                          (account?.current_balance || 0) -
                            (account?.reserved_amount || 0),
                        )}
                      </b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </>
    );
  }
  function Allowances() {
    return (
      <>
        <PageHead
          eyebrow="Financial controls"
          title="Allowance management"
          subtitle="Assign balances and preserve an auditable transaction history"
          action={<div className="row-actions"><button className="button button-dark" disabled={busy} onClick={assignAllAllowances}>Set all annual allowances</button><button className="button button-light" disabled={busy} onClick={resetAllowances}>Reset annual allowances</button></div>}
        />
        <section className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th className="right">Annual</th>
                <th className="right">Spent</th>
                <th className="right">Reserved</th>
                <th className="right">Available</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const member = members.find(
                  (item) => item.id === account.member_id,
                );
                return (
                  <tr key={account.id}>
                    <td>
                      <b>
                        {member?.first_name} {member?.last_name}
                      </b>
                      <small className="block">{member?.rank}</small>
                    </td>
                    <td className="right">{money(account.annual_amount)}</td>
                    <td className="right">{money(account.spent_amount)}</td>
                    <td className="right amber-text">
                      {money(account.reserved_amount)}
                    </td>
                    <td className="right">
                      <b>
                        {money(
                          account.current_balance - account.reserved_amount,
                        )}
                      </b>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          disabled={busy}
                          onClick={() =>
                            adjust(account.member_id, account.id, "credit")
                          }
                        >
                          + Credit
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            adjust(account.member_id, account.id, "debit")
                          }
                        >
                          Deduct
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            adjust(account.member_id, account.id, "set")
                          }
                        >
                          Set annual
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </>
    );
  }
  function Approvals() {
    return (
      <>
        <PageHead
          eyebrow="Approval queue"
          title="Requests awaiting review"
          subtitle="Approve all or selected items before GearGuard creates the Shopify draft order"
        />
        <section className="card">
          <RequestList requests={pending} actions />
        </section>
      </>
    );
  }
  function Shopify() {
    const selected = companies.find((item) => item.id === companyId);
    const locations = selected?.locations.nodes || [];
    return (
      <>
        <PageHead
          eyebrow="Commerce connection"
          title="Shopify B2B integration"
          subtitle="Connect a company, assign its Shopify collections, and keep orders synchronized"
        />
        <div className="integration-hero">
          <div className="integration-icon">
            <Store />
          </div>
          <div>
            <span className="live-dot">
              {context.department.shopify_company_id
                ? "Connected"
                : "Ready to connect"}
            </span>
            <h2>
              {context.department.shopify_company_name ||
                "Choose a B2B company"}
            </h2>
            <p>
              {context.department.shopify_shop_domain ||
                "Shop credentials remain server-side"}
            </p>
          </div>
          <button
            className="button button-red"
            disabled={busy || !context.department.shopify_company_id}
            onClick={syncShopify}
          >
            <RefreshCw size={16} className={busy ? "spin" : ""} />
            {busy ? "Working…" : "Import members & catalog"}
          </button>
        </div>
        <section className="card connect-card">
          <div className="section-head">
            <h3>Company mapping</h3>
            <button onClick={loadCompanies}>
              <RefreshCw />
              Load companies
            </button>
          </div>
          <div className="connect-form">
            <label>
              Shopify B2B company
              <select
                value={companyId}
                onChange={(event) => {
                  setCompanyId(event.target.value);
                  const company = companies.find(
                    (item) => item.id === event.target.value,
                  );
                  setLocationId(company?.locations.nodes[0]?.id || "");
                }}
              >
                <option value="">Select a company</option>
                {companies.map((company) => (
                  <option value={company.id} key={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Default company location
              <select
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">Select a location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-dark"
              disabled={busy || !companyId || !locationId}
              onClick={connectCompany}
            >
              Save connection
            </button>
          </div>
        </section>
        <section className="card collection-card">
          <div className="section-head">
            <div>
              <h3>Company collections</h3>
              <p>
                Only products inside selected collections appear for this
                company.
              </p>
            </div>
            <button onClick={loadCollections} disabled={busy || !companyId}>
              <RefreshCw />
              Load collections
            </button>
          </div>
          {collectionOptions.length ? (
            <>
              <div className="collection-picker">
                {collectionOptions.map((collection) => (
                  <label
                    className={collection.selected ? "selected" : ""}
                    key={collection.id}
                  >
                    <input
                      type="checkbox"
                      checked={collection.selected}
                      onChange={() =>
                        setCollectionOptions((rows) =>
                          rows.map((row) =>
                            row.id === collection.id
                              ? { ...row, selected: !row.selected }
                              : row,
                          ),
                        )
                      }
                    />
                    <span className="collection-check">
                      {collection.selected ? <Check size={14} /> : null}
                    </span>
                    <Layers3 />
                    <span>
                      <b>{collection.title}</b>
                      <small>/{collection.handle}</small>
                    </span>
                  </label>
                ))}
              </div>
              <div className="collection-actions">
                <span>
                  {
                    collectionOptions.filter(
                      (collection) => collection.selected,
                    ).length
                  }{" "}
                  selected
                </span>
                <button
                  className="button button-dark"
                  disabled={busy}
                  onClick={saveCollections}
                >
                  Save company catalog
                </button>
              </div>
            </>
          ) : (
            <div className="collection-empty">
              Load collections from Shopify, then select the ones this company
              is allowed to shop.
            </div>
          )}
        </section>
        <div className="integration-grid">
          <section className="card">
            <SectionHead title="Connection" />
            <div className="detail-list">
              <div>
                <span>B2B company</span>
                <b>
                  {context.department.shopify_company_name || "Not selected"}
                </b>
              </div>
              <div>
                <span>Company ID</span>
                <code>{context.department.shopify_company_id || "—"}</code>
              </div>
              <div>
                <span>Assigned collections</span>
                <b>
                  {
                    collectionOptions.filter(
                      (collection) => collection.selected,
                    ).length
                  }
                </b>
              </div>
              <div>
                <span>Last successful sync</span>
                <b>
                  {date(context.department.shopify_last_sync_at || undefined)}
                </b>
              </div>
              <div>
                <span>Imported contacts</span>
                <b>
                  {
                    members.filter(
                      (member) => member.shopify_company_contact_id,
                    ).length
                  }
                </b>
              </div>
            </div>
          </section>
          <section className="card">
            <SectionHead title="Automation coverage" />
            <div className="check-list">
              <span>
                <CheckCircle2 />
                Company contacts → members
              </span>
              <span>
                <CheckCircle2 />
                Assigned collections → company catalog
              </span>
              <span>
                <CheckCircle2 />
                Approved requests → draft orders
              </span>
              <span>
                <CheckCircle2 />
                Paid, fulfilled, cancelled and refunded webhooks
              </span>
            </div>
          </section>
        </div>
        <section className="card setup-card">
          <CloudCog />
          <div>
            <h3>Webhook endpoint</h3>
            <p>
              <code>/api/shopify/webhook</code> verifies Shopify HMAC signatures
              and processes each event once.
            </p>
          </div>
          <button
            className="button button-light"
            disabled={busy}
            onClick={registerWebhooks}
          >
            Register webhooks
          </button>
        </section>
        <section className="card setup-card">
          <History />
          <div>
            <h3>Six-month purchase history</h3>
            <p>Import each linked member’s recent Shopify orders, skip duplicates, and deduct purchases from the allowance you assign.</p>
          </div>
          <button className="button button-light" disabled={busy||!context.department.shopify_company_id} onClick={importPurchaseHistory}>
            Import six months
          </button>
        </section>
      </>
    );
  }
  function Ledger({ compact = false }: { compact?: boolean }) {
    return (
      <div className="ledger">
        {context.ledger.slice(0, compact ? 4 : 50).map((entry) => (
          <div key={entry.id}>
            <span
              className={`ledger-icon ${entry.amount > 0 ? "positive" : ""}`}
            >
              {entry.amount > 0 ? "+" : "−"}
            </span>
            <div>
              <b>{entry.type.replaceAll("_", " ")}</b>
              <small>
                {entry.reason} · {date(entry.created_at)}
              </small>
            </div>
            <strong className={entry.amount > 0 ? "positive-text" : ""}>
              {entry.amount > 0 ? "+" : ""}
              {money(entry.amount)}
            </strong>
            {!compact && <em>{money(entry.balance_after)}</em>}
          </div>
        ))}
      </div>
    );
  }
  function RequestList({
    requests,
    actions = false,
  }: {
    requests: PortalContext["requests"];
    actions?: boolean;
  }) {
    return (
      <div className="request-list">
        {requests.length === 0 ? (
          <div className="empty">
            <CheckCircle2 />
            <b>All caught up</b>
            <span>No requests need attention.</span>
          </div>
        ) : (
          requests.map((request) => (
            <div key={request.id}>
              <div className="request-badge">
                <ClipboardCheck />
              </div>
              <div>
                <b>{request.request_number}</b>
                <span>
                  {request.member_name} · {date(request.submitted_at)}
                </span>
              </div>
              <strong>{money(request.total_amount)}</strong>
              {actions ? (
                <div className="approval-actions">
                  <button
                    disabled={busy}
                    onClick={() => decide(request.id, "APPROVE")}
                  >
                    <Check />
                    Approve
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => decide(request.id, "DENY")}
                  >
                    <X />
                    Deny
                  </button>
                </div>
              ) : (
                <ChevronRight />
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <div className="side-brand">
          <span className="brand-mark">G</span>
          <div>
            <b>GearGuard</b>
            <small>Uniform command</small>
          </div>
          <button className="close-menu" onClick={() => setMobileOpen(false)}>
            <X />
          </button>
        </div>
        <div className="agency-block">
          <span>{context.department.code}</span>
          <div>
            <b>{context.department.name}</b>
            <small>
              {mode === "manager" ? "Manager portal" : "Member portal"}
            </small>
          </div>
        </div>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button
              key={String(key)}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(String(key));
                setMobileOpen(false);
              }}
            >
              <Icon size={18} />
              {String(label)}
            </button>
          ))}
        </nav>
        {mode === "member" && context.member.role !== "member" && (
          <Link className="switch-portal" href="/manager">
            <ShieldCheck />
            Manager portal
            <ArrowRight />
          </Link>
        )}
        {mode === "manager" && (
          <Link className="switch-portal" href="/portal">
            <ShoppingBag />
            Member portal
            <ArrowRight />
          </Link>
        )}
        <button className="signout" disabled={busy} onClick={signOut}>
          <LogOut />
          Sign out
        </button>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileOpen(true)}>
            <Menu />
          </button>
          <div className="top-title">
            <span>
              {mode === "manager" ? "Manager portal" : "Member portal"}
            </span>
            <b>{context.department.name}</b>
          </div>
          {mode==="manager"&&context.platformOwner&&context.departments.length>0&&(
            <label className="view-as-control">
              <span>View as</span>
              <select value={context.department.id} disabled={busy} onChange={(event)=>viewDepartment(event.target.value)}>
                {context.departments.map((department)=><option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
          )}
          <div className="top-user">
            <div>
              <b>
                {context.member.first_name} {context.member.last_name}
              </b>
              <span>{context.member.rank}</span>
            </div>
            <i>
              {context.member.first_name[0]}
              {context.member.last_name[0]}
            </i>
          </div>
        </header>
        <main className="page-wrap">
          {context.demo && (
            <div className="demo-banner">
              <span>Interactive preview</span> Shopify and Supabase actions are
              simulated until credentials are connected.
            </div>
          )}
          {notice && (
            <div className="notice">
              <CheckCircle2 />
              {notice}
              <button onClick={() => setNotice("")}>
                <X />
              </button>
            </div>
          )}
          {page}
        </main>
      </div>
      {cartOpen && (
        <div className="drawer-wrap">
          <button
            className="drawer-backdrop"
            onClick={() => setCartOpen(false)}
            aria-label="Close cart"
          />
          <aside className="cart-drawer">
            <header>
              <div>
                <small>Procurement request</small>
                <h2>Your cart</h2>
              </div>
              <button onClick={() => setCartOpen(false)}>
                <X />
              </button>
            </header>
            <div className="cart-lines">
              {cart.length === 0 ? (
                <div className="empty">
                  <ShoppingBag />
                  <b>Your cart is empty</b>
                </div>
              ) : (
                cart.map((line) => {
                  const variant = line.product.variants.find(
                    (item) => item.id === line.variantId,
                  );
                  return (
                    <div key={`${line.product.id}-${line.variantId}`}>
                      <div>
                        <b>{line.product.title}</b>
                        <select
                          value={line.variantId}
                          onChange={(event) =>
                            setCart((items) =>
                              items.map((item) =>
                                item === line
                                  ? { ...item, variantId: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        >
                          {line.product.variants.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title} · {money(item.price)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(event) =>
                          setCart((items) =>
                            items.map((item) =>
                              item === line
                                ? {
                                    ...item,
                                    quantity: Math.max(
                                      1,
                                      Number(event.target.value),
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      <button
                        onClick={() =>
                          setCart((items) =>
                            items.filter((item) => item !== line),
                          )
                        }
                      >
                        <X />
                      </button>
                      <strong>
                        {money(
                          (variant?.price || line.product.price) *
                            line.quantity,
                        )}
                      </strong>
                    </div>
                  );
                })
              )}
            </div>
            <footer>
              <div>
                <span>Available allowance</span>
                <b>{money(available)}</b>
              </div>
              <div>
                <span>Request total</span>
                <strong>{money(cartTotal)}</strong>
              </div>
              {cartTotal > available && (
                <div className="overage">
                  <span>Personal overage</span>
                  <b>{money(cartTotal - available)}</b>
                </div>
              )}
              <button
                className="button button-red"
                disabled={!cart.length || busy}
                onClick={submitCart}
              >
                {busy
                  ? "Submitting…"
                  : cartTotal > context.department.approval_threshold
                    ? "Submit for approval"
                    : "Create Shopify order"}
                <ArrowRight />
              </button>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}

function PageHead({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function SectionHead({
  title,
  link,
  action,
}: {
  title: string;
  link?: string;
  action?: () => void;
}) {
  return (
    <div className="section-head">
      <h3>{title}</h3>
      {link && (
        <button onClick={action}>
          {link}
          <ArrowRight />
        </button>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  meta,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  meta: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <article className={accent ? "stat-card accent" : "stat-card"}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
      <i>
        <Icon />
      </i>
    </article>
  );
}
function Quick({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
  action: () => void;
}) {
  return (
    <button className="quick-card" onClick={action}>
      <i>
        <Icon />
      </i>
      <div>
        <b>{title}</b>
        <span>{text}</span>
      </div>
      <ArrowRight />
    </button>
  );
}
