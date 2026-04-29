import Link from "next/link";
import { AuthShell } from "@/components/shells/AuthShell";
import { SignInForm } from "@/components/auth/SignInForm";

export default function SignInPage() {
  return (
    <AuthShell title="Sign in to Backdesk">
      <SignInForm />
      <p className="mt-4 text-sm text-muted-foreground text-center">
        New to Backdesk? <Link href="/sign-up" className="underline">Create an account</Link>
        <br/>
        <Link href="/reset-password" className="underline">Forgot your password?</Link>
      </p>
    </AuthShell>
  );
}
