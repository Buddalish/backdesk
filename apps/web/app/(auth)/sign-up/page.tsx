import Link from "next/link";
import { AuthShell } from "@/components/shells/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your Backdesk account"
      description="One workspace for your data."
    >
      <SignUpForm />
      <p className="mt-4 text-sm text-muted-foreground text-center">
        Already have an account? <Link href="/sign-in" className="underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
