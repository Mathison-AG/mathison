import { Rocket, MessageCircle, Boxes } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth();

  const deploymentCount = await prisma.deployment.count({
    where: { tenantId: session!.user.tenantId },
  });

  if (deploymentCount > 0) {
    // Show deployment summary — canvas will replace this in Step 10
    return (
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Your Stack</h2>
          <p className="text-muted-foreground">
            You have {deploymentCount} deployment
            {deploymentCount !== 1 ? "s" : ""} running. The visual canvas is
            coming soon.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            icon={Boxes}
            label="Deployments"
            value={deploymentCount.toString()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Rocket className="size-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">
            Welcome to Mathison
          </h2>
          <p className="text-muted-foreground">
            Deploy databases, apps, and services by simply chatting with
            Mathison — your AI-powered cloud platform.
          </p>
        </div>
        <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
          <MessageCircle className="size-4" />
          <span>Click the chat button to get started</span>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-5 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
