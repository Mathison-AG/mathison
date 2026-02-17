"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { WelcomeCategories } from "@/components/onboarding/welcome-categories";

interface WelcomeClientProps {
  firstName: string;
}

export function WelcomeClient({ firstName }: WelcomeClientProps) {
  const router = useRouter();

  function handleComplete() {
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="size-7 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome to Mathison, {firstName}!
            </h1>
            <p className="text-muted-foreground">
              Let&apos;s get you started. What are you most interested in?
            </p>
          </div>
        </div>

        {/* Categories */}
        <WelcomeCategories onComplete={handleComplete} />
      </div>
    </div>
  );
}
