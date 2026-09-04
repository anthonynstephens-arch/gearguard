import { LoginForm } from "@/components/login-form";
import { isDemoMode } from "@/lib/context";
export default function LoginPage(){return <LoginForm demo={isDemoMode()}/>}
