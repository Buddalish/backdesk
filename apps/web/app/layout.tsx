import { Geist_Mono, Geist } from "next/font/google"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@workspace/ui/components/sonner"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils";
import { createClient } from "@/lib/supabase/server";

const geist = Geist({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let accent: string = "default";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("theme_accent").eq("user_id", user.id).maybeSingle();
    if (profile?.theme_accent) accent = profile.theme_accent;
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-accent={accent}
      className={cn("antialiased", fontMono.variable, "font-sans", geist.variable)}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
