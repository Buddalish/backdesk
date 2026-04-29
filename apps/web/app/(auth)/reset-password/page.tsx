import Link from "next/link";
import { AuthShell } from "@/components/shells/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="We'll email you a link to set a new password."
    >
      <ResetPasswordForm />
      <p className="mt-4 text-sm text-muted-foreground text-center">
        <Link href="/sign-in" className="underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
