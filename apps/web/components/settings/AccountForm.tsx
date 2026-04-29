"use client";
import { useState, useTransition } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@workspace/ui/components/field";
import { Separator } from "@workspace/ui/components/separator";
import { toast } from "sonner";
import { updatePassword } from "@/actions/settings";
import { signOut } from "@/actions/auth";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

export function AccountForm({ email }: { email: string }) {
  const [pwd, setPwd] = useState("");
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <FieldGroup>
        <Field>
          <FieldLabel>Email</FieldLabel>
          <FieldDescription>{email}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="new-pwd">Change password</FieldLabel>
          <Input
            id="new-pwd"
            type="password"
            minLength={8}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="New password (min 8)"
          />
          <Button
            disabled={pwd.length < 8}
            onClick={() => startTransition(async () => {
              const result = await updatePassword({ password: pwd });
              if (!result.ok) toast.error(result.error.message);
              else { toast.success("Password updated."); setPwd(""); }
            })}
          >
            Update password
          </Button>
        </Field>
      </FieldGroup>

      <Separator />

      <form action={signOut}>
        <Button type="submit" variant="outline">Sign out</Button>
      </form>

      <Separator />

      <div>
        <h2 className="text-base font-semibold text-destructive mb-2">Danger zone</h2>
        <DeleteAccountDialog />
      </div>
    </div>
  );
}
