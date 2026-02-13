import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">
            Manage your workspace and account settings.
          </p>
        </div>
      </div>
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          Settings UI coming in Step 11
        </p>
      </div>
    </div>
  );
}
