import { redirect } from "next/navigation";
import { PortalApp } from "@/components/portal-app";
import { loadPortalContext } from "@/lib/context";
export default async function ManagerPage(){const context=await loadPortalContext();if(!context)redirect("/login");if(!context.demo&&context.member.role==="member")redirect("/portal");return <PortalApp context={context} mode="manager"/>}
