"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw, Activity, Database, HardDrive } from "lucide-react";

import { Button } from "@/components/ui/button";

// ─── Category definitions ────────────────────────────────

interface Category {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const CATEGORIES: Category[] = [
  {
    id: "automation",
    label: "Automation",
    description: "Automate workflows and repetitive tasks",
    icon: <RefreshCw className="size-6" />,
  },
  {
    id: "monitoring",
    label: "Monitoring",
    description: "Keep an eye on your websites and services",
    icon: <Activity className="size-6" />,
  },
  {
    id: "database",
    label: "Databases",
    description: "Store and manage your data",
    icon: <Database className="size-6" />,
  },
  {
    id: "storage",
    label: "Storage",
    description: "Your own cloud storage",
    icon: <HardDrive className="size-6" />,
  },
];

// ─── Component ───────────────────────────────────────────

interface WelcomeCategoriesProps {
  onComplete: () => void;
}

export function WelcomeCategories({ onComplete }: WelcomeCategoriesProps) {
  const router = useRouter();

  async function handleCategoryClick(categoryId: string) {
    await markOnboardingComplete();
    router.push(`/?category=${categoryId}`);
  }

  async function handleSkip() {
    await markOnboardingComplete();
    onComplete();
  }

  async function markOnboardingComplete() {
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } catch {
      // Non-blocking — still navigate
    }
  }

  return (
    <div className="space-y-6">
      {/* Category cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => handleCategoryClick(cat.id)}
            className="group flex flex-col items-start gap-3 rounded-xl border bg-card p-5 text-left transition-all hover:border-primary/50 hover:bg-accent hover:shadow-sm"
          >
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              {cat.icon}
            </div>
            <div className="space-y-1">
              <p className="font-medium">{cat.label}</p>
              <p className="text-sm text-muted-foreground leading-snug">
                {cat.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Skip */}
      <div className="flex justify-center">
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={handleSkip}
        >
          Skip — take me to the store
          <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </div>
  );
}
