import { Rocket } from "lucide-react";

export default function DeploymentsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Rocket className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Deployments</h2>
          <p className="text-muted-foreground">
            Monitor and manage your running services.
          </p>
        </div>
      </div>
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          Deployments UI coming in Step 11
        </p>
      </div>
    </div>
  );
}
