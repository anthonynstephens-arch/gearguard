"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CloudCog,
  DollarSign,
  Eye,
  FileDown,
  History,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  TrendingUp,
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
type OrderDetail={historicalOrderId?:string;allowanceAccounted?:boolean;attributedLineItemIds?:string[];reference:string;shopifyReference?:string|null;memberName:string;date:string;status:string;total:number;allowanceAmount:number;personalAmount:number;source:string;lineItems:Array<{id:string;name:string;variantTitle?:string|null;sku?:string|null;quantity:number;unitPrice:number;lineTotal:number;imageUrl?:string|null;properties:Array<{key:string;value:string}>}>};

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
  const [editingMember, setEditingMember] = useState<PortalContext["member"] | null>(null);
  const [editingIsChief,setEditingIsChief]=useState(false);
  const [requests, setRequests] = useState(context.requests);
  const [historicalOrders, setHistoricalOrders] = useState(context.historicalOrders);
  const [departmentRoles,setDepartmentRoles]=useState(context.departmentRoles);
  const [chiefMemberId,setChiefMemberId]=useState(context.department.chief_member_id||"");
  const [attributionMemberId,setAttributionMemberId]=useState("");
  const [orderDetail,setOrderDetail]=useState<OrderDetail|null>(null);
  const [orderLoading,setOrderLoading]=useState(false);
  const [reportView,setReportView]=useState<"allowances"|"orders"|"attention">("allowances");
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
    setMembers(context.members);setAccounts(context.accounts);setRequests(context.requests);setHistoricalOrders(context.historicalOrders);setDepartmentRoles(context.departmentRoles);setChiefMemberId(context.department.chief_member_id||"");
    setCompanyId(context.department.shopify_company_id||"");setLocationId(context.department.shopify_company_location_id||"");
    setCollectionOptions(context.collections.map((collection)=>({id:collection.shopify_collection_id,title:collection.title,handle:collection.handle,updatedAt:collection.shopify_synced_at||new Date().toISOString(),imageUrl:collection.image_url,selected:true})));
  },[context]);
  useEffect(()=>{
    if(mode!=="manager"||context.demo)return;
    const refresh=()=>router.refresh();
    window.addEventListener("focus",refresh);
    const timer=window.setInterval(refresh,15000);
    return()=>{window.removeEventListener("focus",refresh);window.clearInterval(timer)};
  },[mode,context.demo,router]);
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
          ["reports", "Reports", BarChart3],
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
        const data=await response.json();
        if (!response.ok)throw new Error(data.error || "Checkout failed");
        setRequests(rows=>[data.request,...rows.filter(row=>row.id!==data.request.id)]);
        setNotice(data.request.status==="PENDING_APPROVAL"?"Request submitted for manager approval":"Order created in Shopify");
      }else{
        setNotice(cartTotal > context.department.approval_threshold?"Request submitted for manager approval":"Order created in Shopify");
      }
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
        const data=await response.json();
        if (!response.ok) throw new Error(data.error || "Sync failed");
        setNotice(`${data.members.created} members added, ${data.members.updated} updated, and ${data.products.synced} products imported from ${data.collections.synced} assigned collections`);
      } else {
        setNotice("Shopify members and assigned collection products imported successfully");
      }
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }
  async function importPurchaseHistory(){
    if(!window.confirm("Import all orders from this Shopify B2B company for the last six months, match them to department members, and deduct them from assigned allowances? Orders already imported will be skipped."))return;
    setBusy(true);
    try{
      if(context.demo){setNotice("Historical purchases imported; duplicate orders were skipped");return}
      const response=await fetch("/api/shopify/import-history",{method:"POST"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Purchase history import failed");
      setNotice(`${data.imported} of ${data.ordersFound} department orders imported; ${money(data.amountDeducted)} deducted${data.unmatched?`; ${data.unmatched} could not be matched to a member`:""}${data.warning?` — ${data.warning}`:""}`);
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
        const syncResponse=await fetch("/api/shopify/sync",{method:"POST"});
        const syncData=await syncResponse.json();
        if(!syncResponse.ok)throw new Error(syncData.error||"Collections saved, but product import failed");
        setNotice(`${selectedCollections.length} ${selectedCollections.length===1?"collection":"collections"} assigned and ${syncData.products.synced} products imported`);
        router.refresh();
      } else {
        setNotice(`${selectedCollections.length} ${selectedCollections.length === 1 ? "collection" : "collections"} assigned and products imported`);
      }
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
  async function saveMember() {
    if (!editingMember) return;
    setBusy(true);
    try {
      let updated = editingMember;
      if (!context.demo) {
        const response = await fetch("/api/members", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: editingMember.id,
            email: editingMember.email,
            firstName: editingMember.first_name,
            lastName: editingMember.last_name,
            employeeId: editingMember.employee_id || null,
            badgeNumber: editingMember.badge_number || null,
            rank: editingMember.rank || null,
            station: editingMember.station || null,
            platoon: editingMember.platoon || null,
            role: editingMember.role,
            departmentRoleId:editingMember.department_role_id||null,
            isChief:editingIsChief,
            status: editingMember.status,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Member update failed");
        updated = data.member;
      }
      setMembers((rows) => rows.map((member) => member.id === updated.id ? updated : member));
      if(editingIsChief)setChiefMemberId(updated.id);else if(chiefMemberId===updated.id)setChiefMemberId("");
      setEditingMember(null);
      setNotice(`${updated.first_name} ${updated.last_name} updated`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Member update failed");
    } finally {
      setBusy(false);
    }
  }
  async function addDepartmentRole(){
    const name=window.prompt("Role name (for example, Captain or Quartermaster)");if(!name?.trim())return;
    const raw=window.prompt("Portal access: member, manager, or admin","member")?.trim().toLowerCase();
    if(!raw||!["member","manager","admin"].includes(raw))return setNotice("Portal access must be member, manager, or admin");
    const description=window.prompt("Short role description (optional)")||null;
    setBusy(true);try{
      let role={id:crypto.randomUUID(),department_id:context.department.id,name:name.trim(),description,portal_access:raw as "member"|"manager"|"admin"};
      if(!context.demo){const response=await fetch("/api/roles",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,description,portalAccess:raw})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Role creation failed");role=data.role}
      setDepartmentRoles(rows=>[...rows,role].sort((a,b)=>a.name.localeCompare(b.name)));setNotice(`${role.name} role created`);
    }catch(error){setNotice(error instanceof Error?error.message:"Role creation failed")}finally{setBusy(false)}
  }
  async function attributeItem(lineItemId:string){
    if(!orderDetail?.historicalOrderId||!attributionMemberId)return setNotice("Choose a member first");
    setBusy(true);try{
      if(!context.demo){const response=await fetch("/api/allowances/attribute-item",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({historicalOrderId:orderDetail.historicalOrderId,lineItemId,memberId:attributionMemberId})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Attribution failed")}
      setOrderDetail(detail=>detail?{...detail,attributedLineItemIds:[...(detail.attributedLineItemIds||[]),lineItemId]}:detail);
      setNotice("Item attributed and allowance updated");router.refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Attribution failed")}finally{setBusy(false)}
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
  async function openOrder(type:"request"|"historical",id:string){
    setOrderDetail(null);setOrderLoading(true);
    try{
      if(context.demo){
        const request=requests.find(item=>item.id===id);
        const product=context.products[0];
        setOrderDetail({reference:request?.request_number||"#1844",shopifyReference:request?.shopify_order_name,memberName:request?.member_name||`${context.member.first_name} ${context.member.last_name}`,date:request?.submitted_at||new Date().toISOString(),status:request?.status||"COMPLETED",total:request?.total_amount||product.price,allowanceAmount:request?.allowance_amount||product.price,personalAmount:request?.personal_amount||0,source:type==="request"?"GearGuard":"Shopify import",lineItems:[{id:"demo-line",name:product.title,variantTitle:product.variants[0]?.title,sku:product.variants[0]?.sku,quantity:1,unitPrice:product.price,lineTotal:product.price,imageUrl:product.image_url,properties:[]}]});
        return;
      }
      const response=await fetch(`/api/orders/details?type=${type}&id=${id}`);
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load order details");
      setOrderDetail(data.order);
    }catch(error){setNotice(error instanceof Error?error.message:"Could not load order details");setOrderLoading(false)}finally{setOrderLoading(false)}
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
    if (tab === "reports") return <Reports />;
    if (tab === "shopify") return <Shopify />;
    return <ManagerOverview />;
  }

  function MemberOverview() {
    const usedPct = context.account.annual_amount > 0
      ? Math.min(100,(context.account.spent_amount/context.account.annual_amount)*100)
      : 0;
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
    const utilization=allocated>0?(spent/allocated)*100:0;
    const healthRows=members.map(member=>{const account=accounts.find(item=>item.member_id===member.id);const annual=account?.annual_amount||0,used=account?.spent_amount||0,reserved=account?.reserved_amount||0,available=Math.max(0,(account?.current_balance||0)-reserved),usedPct=annual>0?Math.min(100,(used/annual)*100):0;const level=annual===0?"unassigned":available===0?"exhausted":usedPct>=80?"low":usedPct>=60?"watch":"healthy";return{member,account,annual,used,reserved,available,usedPct,level}}).sort((a,b)=>b.usedPct-a.usedPct||a.member.last_name.localeCompare(b.member.last_name));
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
            meta={`${Math.round(utilization)}% utilization`}
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
              title="Program signals"
              link="Open reports"
              action={() => setTab("reports")}
            />
            <div className="signal-grid">
              <div><i className="signal-icon good"><CheckCircle2/></i><span>Healthy balances</span><b>{healthRows.filter(row=>row.level==="healthy").length}</b><small>Below 60% utilized</small></div>
              <div><i className="signal-icon warn"><TrendingUp/></i><span>Watch closely</span><b>{healthRows.filter(row=>row.level==="watch"||row.level==="low").length}</b><small>60–99% utilized</small></div>
              <div><i className="signal-icon danger"><AlertTriangle/></i><span>Needs setup</span><b>{healthRows.filter(row=>row.level==="unassigned"||row.level==="exhausted").length}</b><small>No allowance or no balance</small></div>
              <div><i className="signal-icon"><Store/></i><span>Shopify coverage</span><b>{members.filter(row=>row.shopify_company_contact_id).length}/{members.length}</b><small>Members linked</small></div>
            </div>
          </section>
        </div>
        <section className="card allowance-health-panel">
          <div className="section-head"><div><h3>Allowance health — all members</h3><p>Live balance, spending pace, reserved funds, and risk status across the department.</p></div><button onClick={()=>setTab("allowances")}>Manage allowances <ChevronRight/></button></div>
          <div className="member-health-grid">
            {healthRows.map(row=><article className={`member-health-card health-${row.level}`} key={row.member.id}>
              <div className="member-health-top"><span className="health-avatar">{row.member.first_name[0]}{row.member.last_name[0]}</span><div><b>{row.member.first_name} {row.member.last_name}</b><small>{row.member.rank||"Rank not assigned"}{row.member.station?` · Station ${row.member.station}`:""}</small></div><em>{row.level==="unassigned"?"Not assigned":row.level==="exhausted"?"Exhausted":row.level==="low"?"Low balance":row.level==="watch"?"Watch":"Healthy"}</em></div>
              <div className="member-balance"><span>Available now</span><strong>{money(row.available)}</strong><small>of {money(row.annual)} annual</small></div>
              <div className="health-progress"><i style={{width:`${row.usedPct}%`}}/></div>
              <div className="health-foot"><span><b>{money(row.used)}</b> spent</span><span><b>{money(row.reserved)}</b> reserved</span><span><b>{row.usedPct.toFixed(0)}%</b> used</span></div>
            </article>)}
          </div>
        </section>
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
        {filteredProducts.length===0?<section className="card catalog-empty-state"><ShoppingBag/><div><h3>{context.products.length?"No products match your filters":"Your department catalog is being prepared"}</h3><p>{context.products.length?"Try another category or search term.":"A department manager must select Shopify collections and save the company catalog before products appear here."}</p></div></section>:null}
      </>
    );
  }
  function Orders({ personal = false }: { personal?: boolean }) {
    const visibleRequests=personal?requests.filter((request)=>request.member_id===context.member.id):requests;
    const requestShopifyNames=new Set(visibleRequests.map(request=>request.shopify_order_name).filter(Boolean));
    const requestRows=visibleRequests.map((request)=>({
      id:`request-${request.id}`,recordId:request.id,type:"request" as const,reference:request.request_number,memberName:request.member_name,date:request.submitted_at,status:request.status,shopify:request.shopify_order_name||"—",total:request.total_amount,
    }));
    const importedRows=(personal?historicalOrders.filter((order)=>order.member_id===context.member.id):historicalOrders).filter(order=>!requestShopifyNames.has(order.shopify_order_name)).map((order)=>({
      id:`import-${order.id}`,recordId:order.id,type:"historical" as const,reference:order.shopify_order_name,memberName:order.member_name,date:order.order_created_at,status:"IMPORTED",shopify:order.shopify_order_name,total:order.order_amount,
    }));
    const rows=[...requestRows,...importedRows].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
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
                <th className="right">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id} className="clickable-row" onClick={()=>openOrder(order.type,order.recordId)}>
                  <td>
                    <b>{order.reference}</b>
                  </td>
                  {!personal && <td>{order.memberName}</td>}
                  <td>{date(order.date)}</td>
                  <td>
                    <span className={statusClass(order.status)}>
                      {order.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>{order.shopify}</td>
                  <td className="right">
                    <b>{money(order.total)}</b>
                  </td>
                  <td className="right"><button className="icon-action" onClick={(event)=>{event.stopPropagation();openOrder(order.type,order.recordId)}}><Eye size={15}/> View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
    );
  }
  function Reports(){
    const memberById=new Map(members.map(member=>[member.id,member]));
    const allowanceRows=accounts.map(account=>{const member=memberById.get(account.member_id);const available=Math.max(0,account.current_balance-account.reserved_amount);const utilization=account.annual_amount>0?Math.min(100,(account.spent_amount/account.annual_amount)*100):0;return{...account,member,available,utilization}}).sort((a,b)=>b.utilization-a.utilization);
    const managedShopifyNames=new Set(requests.map(order=>order.shopify_order_name).filter(Boolean));
    const orderRows=[...requests.map(order=>({reference:order.shopify_order_name||order.request_number,member:order.member_name,date:order.submitted_at,status:order.status,total:order.total_amount,source:"GearGuard"})),...historicalOrders.filter(order=>!managedShopifyNames.has(order.shopify_order_name)).map(order=>({reference:order.shopify_order_name,member:order.member_name,date:order.order_created_at,status:"IMPORTED",total:order.order_amount,source:"Shopify import"}))].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
    const allocated=accounts.reduce((sum,account)=>sum+account.annual_amount,0),spent=accounts.reduce((sum,account)=>sum+account.spent_amount,0),remaining=allowanceRows.reduce((sum,row)=>sum+row.available,0),reserved=accounts.reduce((sum,account)=>sum+account.reserved_amount,0),utilization=allocated>0?(spent/allocated)*100:0;
    const attentionRows=allowanceRows.filter(row=>row.annual_amount===0||row.available<=row.annual_amount*.2||row.member?.status!=="active"||!row.member?.shopify_company_contact_id);
    function downloadReport(){
      const rows=reportView==="allowances"?[["Member","Email","Rank","Annual allowance","Spent","Reserved","Available","Utilization"],...allowanceRows.map(row=>[`${row.member?.first_name||""} ${row.member?.last_name||""}`.trim(),row.member?.email||"",row.member?.rank||"",row.annual_amount,row.spent_amount,row.reserved_amount,row.available,`${row.utilization.toFixed(1)}%`])]:reportView==="orders"?[["Order","Member","Date","Status","Source","Total"],...orderRows.map(row=>[row.reference,row.member,row.date,row.status,row.source,row.total])]:[["Member","Issue","Available","Annual allowance","Shopify linked","Status"],...attentionRows.map(row=>[`${row.member?.first_name||""} ${row.member?.last_name||""}`.trim(),row.annual_amount===0?"No allowance assigned":row.available<=row.annual_amount*.2?"Low balance":row.member?.status!=="active"?"Member not active":"Not linked to Shopify",row.available,row.annual_amount,row.member?.shopify_company_contact_id?"Yes":"No",row.member?.status||""])];
      const safe=(value:unknown)=>{let text=String(value??"");if(/^[=+\-@]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`};
      const blob=new Blob([rows.map(row=>row.map(safe).join(",")).join("\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`${context.department.code}-${reportView}-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);
    }
    return <>
      <PageHead eyebrow="Financial intelligence" title="Department reports" subtitle="Allowance utilization, purchasing activity, and roster exceptions in one place" action={<button className="button button-dark" onClick={downloadReport}><FileDown size={16}/> Export CSV</button>}/>
      <section className="report-hero">
        <div><span>Program utilization</span><strong>{utilization.toFixed(0)}%</strong><p>{money(spent)} used from {money(allocated)} assigned</p><div className="report-progress"><i style={{width:`${Math.min(100,utilization)}%`}}/></div></div>
        <div className="report-kpis"><div><span>Available</span><b>{money(remaining)}</b></div><div><span>Reserved</span><b>{money(reserved)}</b></div><div><span>Orders tracked</span><b>{orderRows.length}</b></div><div><span>Needs attention</span><b>{attentionRows.length}</b></div></div>
      </section>
      <div className="report-tabs"><button className={reportView==="allowances"?"active":""} onClick={()=>setReportView("allowances")}>Member allowances</button><button className={reportView==="orders"?"active":""} onClick={()=>setReportView("orders")}>Order activity</button><button className={reportView==="attention"?"active":""} onClick={()=>setReportView("attention")}>Needs attention <span>{attentionRows.length}</span></button></div>
      {reportView==="allowances"?<section className="card table-card report-table"><table><thead><tr><th>Member</th><th>Annual</th><th>Spent</th><th>Reserved</th><th>Available</th><th>Utilization</th></tr></thead><tbody>{allowanceRows.map(row=><tr key={row.id}><td><b>{row.member?.first_name} {row.member?.last_name}</b><small className="block">{row.member?.rank||"No rank assigned"}</small></td><td>{money(row.annual_amount)}</td><td>{money(row.spent_amount)}</td><td>{money(row.reserved_amount)}</td><td><b>{money(row.available)}</b></td><td><div className="utilization-cell"><span>{row.utilization.toFixed(0)}%</span><div className="progress"><i className={row.utilization>=80?"danger":row.utilization>=60?"warning":""} style={{width:`${row.utilization}%`}}/></div></div></td></tr>)}</tbody></table></section>:null}
      {reportView==="orders"?<section className="card table-card report-table"><table><thead><tr><th>Order</th><th>Member</th><th>Date</th><th>Source</th><th>Status</th><th className="right">Total</th></tr></thead><tbody>{orderRows.map((row,index)=><tr key={`${row.reference}-${index}`}><td><b>{row.reference}</b></td><td>{row.member}</td><td>{date(row.date)}</td><td>{row.source}</td><td><span className={statusClass(row.status)}>{row.status.replaceAll("_"," ")}</span></td><td className="right"><b>{money(row.total)}</b></td></tr>)}</tbody></table></section>:null}
      {reportView==="attention"?<div className="attention-grid">{attentionRows.length?attentionRows.map(row=><article className="attention-card" key={row.id}><AlertTriangle/><div><b>{row.member?.first_name} {row.member?.last_name}</b><span>{row.annual_amount===0?"No annual allowance assigned":row.available<=row.annual_amount*.2?`Only ${money(row.available)} available`:row.member?.status!=="active"?`Roster status: ${row.member?.status}`:"Not linked to Shopify"}</span></div><button onClick={()=>{setTab(row.annual_amount===0||row.available<=row.annual_amount*.2?"allowances":"members")}}>Resolve <ChevronRight/></button></article>):<section className="card empty"><CheckCircle2/><b>Everything looks healthy</b><span>No roster or allowance exceptions need attention.</span></section>}</div>:null}
    </>
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
            meta={`${(context.account.annual_amount>0?(context.account.spent_amount/context.account.annual_amount)*100:0).toFixed(0)}% utilized`}
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
          action={<div className="row-actions"><button className="button button-light" disabled={busy} onClick={addDepartmentRole}>+ Define role</button><button
              className="button button-dark"
              disabled={busy}
              onClick={addMember}
            >+ Add member</button></div>}
        />
        <div className="integration-grid role-summary-grid">
          <section className="card"><SectionHead title="Department chief"/><div className="person">{(()=>{const chief=members.find(member=>member.id===chiefMemberId);return chief?<><span>{chief.first_name[0]}{chief.last_name[0]}</span><div><b>{chief.first_name} {chief.last_name}</b><small>{chief.rank||"Department administrator"} · Full access</small></div></>:<div><b>No chief assigned</b><small>Edit a member to designate the department chief.</small></div>})()}</div></section>
          <section className="card"><SectionHead title="Defined roles"/><div className="check-list">{departmentRoles.length?departmentRoles.map(role=><span key={role.id}><ShieldCheck/><b>{role.name}</b> · {role.portal_access} access</span>):<span><AlertTriangle/>No custom roles yet</span>}</div></section>
        </div>
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
                <th className="right">Actions</th>
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
                    <td className="right">
                      <button className="icon-action" onClick={() => {setEditingMember({ ...member });setEditingIsChief(chiefMemberId===member.id)}} aria-label={`Edit ${member.first_name} ${member.last_name}`}>
                        <Pencil size={15} /> Edit
                      </button>
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
                if(mode==="manager"&&(key==="approvals"||key==="orders"))router.refresh();
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
      {editingMember && (
        <div className="drawer-wrap">
          <button className="drawer-backdrop" onClick={() => setEditingMember(null)} aria-label="Close member editor" />
          <aside className="cart-drawer member-editor">
            <header>
              <div><small>Roster management</small><h2>Edit member</h2></div>
              <button onClick={() => setEditingMember(null)}><X /></button>
            </header>
            <div className="member-edit-form">
              <label>First name<input value={editingMember.first_name} onChange={(event)=>setEditingMember({...editingMember,first_name:event.target.value})} /></label>
              <label>Last name<input value={editingMember.last_name} onChange={(event)=>setEditingMember({...editingMember,last_name:event.target.value})} /></label>
              <label className="wide">Email<input type="email" value={editingMember.email} onChange={(event)=>setEditingMember({...editingMember,email:event.target.value})} /></label>
              <label>Employee ID<input value={editingMember.employee_id||""} onChange={(event)=>setEditingMember({...editingMember,employee_id:event.target.value})} /></label>
              <label>Badge number<input value={editingMember.badge_number||""} onChange={(event)=>setEditingMember({...editingMember,badge_number:event.target.value})} /></label>
              <label>Rank / title<input value={editingMember.rank||""} onChange={(event)=>setEditingMember({...editingMember,rank:event.target.value})} /></label>
              <label>Station<input value={editingMember.station||""} onChange={(event)=>setEditingMember({...editingMember,station:event.target.value})} /></label>
              <label>Platoon / shift<input value={editingMember.platoon||""} onChange={(event)=>setEditingMember({...editingMember,platoon:event.target.value})} /></label>
              <label>Portal role<select value={editingMember.role} onChange={(event)=>setEditingMember({...editingMember,role:event.target.value as PortalContext["member"]["role"]})}><option value="member">Member</option><option value="manager">Manager</option><option value="admin">Department admin</option></select></label>
              <label>Department role<select value={editingMember.department_role_id||""} onChange={(event)=>{const role=departmentRoles.find(item=>item.id===event.target.value);setEditingMember({...editingMember,department_role_id:event.target.value||null,role:role?.portal_access||editingMember.role})}}><option value="">No custom role</option>{departmentRoles.map(role=><option key={role.id} value={role.id}>{role.name} · {role.portal_access}</option>)}</select></label>
              <label>Status<select value={editingMember.status} onChange={(event)=>setEditingMember({...editingMember,status:event.target.value as PortalContext["member"]["status"]})}><option value="active">Active</option><option value="leave">On leave</option><option value="inactive">Inactive</option></select></label>
              <label className="wide chief-toggle"><input type="checkbox" checked={editingIsChief} onChange={(event)=>{setEditingIsChief(event.target.checked);setEditingMember({...editingMember,role:event.target.checked?"admin":editingMember.role})}}/> Designate as department chief (grants admin access)</label>
            </div>
            <footer><button className="button button-dark" disabled={busy||!editingMember.first_name.trim()||!editingMember.last_name.trim()||!editingMember.email.trim()} onClick={saveMember}>{busy?"Saving…":"Save member"}</button></footer>
          </aside>
        </div>
      )}
      {(orderLoading||orderDetail) && (
        <div className="drawer-wrap">
          <button className="drawer-backdrop" onClick={()=>{setOrderDetail(null);setOrderLoading(false)}} aria-label="Close order details" />
          <aside className="cart-drawer order-detail-drawer">
            <header>
              <div><small>{orderDetail?.source||"Order history"}</small><h2>{orderDetail?.reference||"Loading order…"}</h2></div>
              <button onClick={()=>{setOrderDetail(null);setOrderLoading(false)}}><X /></button>
            </header>
            {orderLoading?<div className="drawer-loading"><RefreshCw className="spin"/><b>Loading line items…</b></div>:orderDetail?<>
              <div className="order-detail-summary">
                <div><span>Member</span><b>{orderDetail.memberName}</b></div>
                <div><span>Date</span><b>{date(orderDetail.date)}</b></div>
                <div><span>Status</span><b>{orderDetail.status.replaceAll("_"," ")}</b></div>
                <div><span>Total</span><b>{money(orderDetail.total)}</b></div>
              </div>
              <div className="order-line-list">
                <h3>Line items <span>{orderDetail.lineItems.reduce((sum,item)=>sum+item.quantity,0)} items</span></h3>
                {mode==="manager"&&orderDetail.historicalOrderId&&!orderDetail.allowanceAccounted?<label className="attribution-control">Attribute selected items to<select value={attributionMemberId} onChange={event=>setAttributionMemberId(event.target.value)}><option value="">Choose a member</option>{members.filter(member=>member.status==="active").map(member=><option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}</select><small>Original merchandise value is charged, including Shopify discounts.</small></label>:null}
                {orderDetail.lineItems.map(item=><article key={item.id}>
                  <div className="order-line-image" style={item.imageUrl?{backgroundImage:`url(${item.imageUrl})`}:undefined}>{item.imageUrl?null:<Package/>}</div>
                  <div><b>{item.name}</b><span>{[item.variantTitle,item.sku].filter(Boolean).join(" · ")||"Standard item"}</span>{item.properties.length>0?<small>{item.properties.map(property=>`${property.key}: ${property.value}`).join(" · ")}</small>:null}</div>
                  <div><span>{item.quantity} × {money(item.unitPrice)}</span><b>{money(item.lineTotal)}</b>{mode==="manager"&&orderDetail.historicalOrderId&&!orderDetail.allowanceAccounted?<button className="attribute-button" disabled={busy||!attributionMemberId||(orderDetail.attributedLineItemIds||[]).includes(item.id)} onClick={()=>attributeItem(item.id)}>{(orderDetail.attributedLineItemIds||[]).includes(item.id)?"Applied":"Apply allowance"}</button>:null}</div>
                </article>)}
              </div>
              <footer className="order-total-breakdown">
                <div><span>Allowance applied</span><b>{money(orderDetail.allowanceAmount)}</b></div>
                <div><span>Personal payment</span><b>{money(orderDetail.personalAmount)}</b></div>
                <div><span>Order total</span><strong>{money(orderDetail.total)}</strong></div>
              </footer>
            </>:null}
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
