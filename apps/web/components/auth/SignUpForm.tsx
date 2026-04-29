"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { Separator } from "@workspace/ui/components/separator";
import { signUp, signInWithGoogle } from "@/actions/auth";

export function SignUpForm() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <form
        action={(fd) =>
          startTransition(async () => {
            const result = await signUp(fd);
            if (result && !result.ok) {
              toast.error(result.error.message);
            } else {
              router.refresh();
            }
          })
        }
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={8} />
          </Field>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating account…" : "Create account"}
          </Button>
        </FieldGroup>
      </form>

      <div className="mt-4 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">OR</span>
        <Separator className="flex-1" />
      </div>
      <form
        action={async () => {
          const result = await signInWithGoogle();
          if (result && !result.ok) {
            toast.error(result.error.message);
          }
        }}
        className="mt-4"
      >
        <Button type="submit" variant="outline" className="w-full">Continue with Google</Button>
      </form>
    </>
  );
}
