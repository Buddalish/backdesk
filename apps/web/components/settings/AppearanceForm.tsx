"use client";
import { useEffect, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@workspace/ui/components/field";
import { toast } from "sonner";
import { updateAppearance } from "@/actions/settings";

const ACCENTS = ["default", "blue", "emerald", "rose", "amber", "violet"] as const;
type Accent = typeof ACCENTS[number];
type Mode = "light" | "dark" | "system";

export function AppearanceForm({
  initialMode, initialAccent,
}: {
  initialMode: Mode;
  initialAccent: Accent;
}) {
  const { setTheme, theme } = useTheme();
  const [accent, setAccent] = useState<Accent>(initialAccent);
  const [, startTransition] = useTransition();

  // On first mount, sync next-themes state with the persisted profile value.
  useEffect(() => {
    if (theme && theme !== initialMode) {
      setTheme(initialMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply data-accent on the html element whenever it changes (immediate visual feedback).
  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  function commit(mode: Mode | undefined, acc: Accent) {
    if (!mode) return; // wait for next-themes to hydrate before writing to DB
    startTransition(async () => {
      const result = await updateAppearance({ theme_mode: mode, theme_accent: acc });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Theme mode</FieldLabel>
        <ToggleGroup
          type="single"
          value={(theme as Mode | undefined) ?? "system"}
          onValueChange={(v) => {
            if (!v) return;
            const m = v as Mode;
            setTheme(m);
            commit(m, accent);
          }}
        >
          <ToggleGroupItem value="light">Light</ToggleGroupItem>
          <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
          <ToggleGroupItem value="system">System</ToggleGroupItem>
        </ToggleGroup>
      </Field>

      <Field>
        <FieldLabel>Accent color</FieldLabel>
        <FieldDescription>Affects buttons, links, and focus rings.</FieldDescription>
        <div className="flex gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => { setAccent(a); commit(theme as Mode | undefined, a); }}
              className={`size-8 rounded-full border-2 transition ${accent === a ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: SWATCHES[a] }}
              aria-label={a}
              aria-pressed={accent === a}
            />
          ))}
        </div>
      </Field>
    </FieldGroup>
  );
}

// OKLCH swatches matching the accent CSS in packages/ui/src/styles/globals.css.
// "default" uses the preset's primary token directly.
const SWATCHES: Record<Accent, string> = {
  default: "var(--primary)",
  blue: "oklch(0.60 0.20 260)",
  emerald: "oklch(0.65 0.15 160)",
  rose: "oklch(0.66 0.22 15)",
  amber: "oklch(0.74 0.16 70)",
  violet: "oklch(0.62 0.22 290)",
};
