"use client";

import { useState } from "react";

import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ChatPanel } from "./chat-panel";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

interface WorkspaceOption {
  id: string;
  slug: string;
  name: string;
  namespace: string;
}

interface DashboardShellProps {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string;
  activeWorkspaceName: string;
}

export function DashboardShell({
  children,
  userName,
  userEmail,
  workspaces,
  activeWorkspaceId,
  activeWorkspaceName,
}: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          userName={userName}
          userEmail={userEmail}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
      </div>

      {/* Mobile sidebar (Sheet) */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-60 p-0" showCloseButton={false} aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            collapsed={false}
            onToggle={() => setMobileMenuOpen(false)}
            userName={userName}
            userEmail={userEmail}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
          />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          workspaceName={activeWorkspaceName}
          userName={userName}
          userEmail={userEmail}
          onMobileMenuToggle={() => setMobileMenuOpen(true)}
        />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Chat panel */}
      <ChatPanel userName={userName} />
    </div>
  );
}
