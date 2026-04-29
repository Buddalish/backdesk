import { SidebarProvider, SidebarInset, SidebarTrigger } from "@workspace/ui/components/sidebar";
import { AppSidebar } from "@/components/sidebar/AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center gap-2 border-b px-4 h-12">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
