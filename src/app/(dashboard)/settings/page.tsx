import { Settings } from "lucide-react";

import { auth } from "@/lib/auth";
import { WorkspaceManager } from "@/components/settings/workspace-manager";

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Manage your workspaces and account settings.
          </p>
        </div>
      </div>

      {/* Workspace management section */}
      {session?.user && <WorkspaceManager />}
    </div>
  );
}
