import { redirect } from "next/navigation";
import { PortalApp } from "@/components/portal-app";
import { loadPortalContext } from "@/lib/context";
export default async function PortalPage(){const context=await loadPortalContext();if(!context)redirect("/login");return <PortalApp context={context} mode="member"/>}
