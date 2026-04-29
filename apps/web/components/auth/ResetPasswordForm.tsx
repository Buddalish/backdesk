"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { requestPasswordReset } from "@/actions/auth";

export function ResetPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) {
    return <p className="text-sm">Check your email for a reset link.</p>;
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await requestPasswordReset(fd);
          if (!result.ok) {
            toast.error(result.error.message);
          } else {
            setSent(true);
          }
        })
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Send reset link"}
        </Button>
      </FieldGroup>
    </form>
  );
}
