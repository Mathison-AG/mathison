"use client";

import Image from "next/image";
import { ArrowLeft, Rocket, Box, Cpu, HardDrive, Info } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { chatEvents } from "@/lib/events";

import type {
  Recipe,
  ConfigField,
  RecipeDependency,
  ResourceSpec
} from "@/types/recipe";

// ─── Tier badge styling ──────────────────────────────────

const defaultTier = {
  label: "Community",
  className:
    "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400 border-zinc-500/25"
};

const tierStyles: Record<string, { label: string; className: string }> = {
  OFFICIAL: {
    label: "Official",
    className:
      "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25"
  },
  VERIFIED: {
    label: "Verified",
    className:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
  },
  COMMUNITY: defaultTier
};

// ─── Component ────────────────────────────────────────────

interface RecipeDetailProps {
  recipe: Recipe;
}

export function RecipeDetail({ recipe }: RecipeDetailProps) {
  const tier = tierStyles[recipe.tier] ?? defaultTier;
  const iconSrc = recipe.iconUrl || `/icons/${recipe.slug}.svg`;
  const configEntries = Object.entries(recipe.configSchema || {});
  const dependencies = (recipe.dependencies || []) as RecipeDependency[];
  const resourceDefaults = recipe.resourceDefaults as ResourceSpec | undefined;
  const resourceLimits = recipe.resourceLimits as ResourceSpec | undefined;

  function handleDeploy() {
    chatEvents.openWithMessage(`Deploy ${recipe.displayName}`);
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/catalog"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to catalog
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border bg-background">
          <Image
            src={iconSrc}
            alt={recipe.displayName}
            width={40}
            height={40}
            className="size-10"
          />
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{recipe.displayName}</h1>
            <Badge variant="outline" className={cn("text-xs", tier.className)}>
              {tier.label}
            </Badge>
            <Badge variant="outline" className="text-xs capitalize">
              {recipe.category}
            </Badge>
          </div>
          <p className="text-muted-foreground">{recipe.description}</p>
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button onClick={handleDeploy} size="lg" className="shrink-0">
          <Rocket className="size-4" />
          Deploy
        </Button>
      </div>

      <Separator />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Config options */}
        {configEntries.length > 0 && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Info className="size-4 text-muted-foreground" />
              <h2 className="font-semibold">Configuration Options</h2>
            </div>
            <div className="space-y-3">
              {configEntries.map(([key, field]) => {
                const f = field as ConfigField;
                return (
                  <div
                    key={key}
                    className="flex items-start justify-between gap-4 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium font-mono text-xs">
                        {f.label || key}
                      </p>
                      {f.description && (
                        <p className="text-muted-foreground text-xs mt-0.5">
                          {f.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {f.type}
                      </Badge>
                      {f.default !== undefined && (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {String(f.default)}
                        </code>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Dependencies */}
        {dependencies.length > 0 && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Box className="size-4 text-muted-foreground" />
              <h2 className="font-semibold">Dependencies</h2>
            </div>
            <div className="space-y-2">
              {dependencies.map((dep) => (
                <div
                  key={dep.service}
                  className="flex items-center gap-2 text-sm"
                >
                  <div className="flex size-6 items-center justify-center rounded border bg-background">
                    <Image
                      src={`/icons/${dep.service}.svg`}
                      alt={dep.service}
                      width={16}
                      height={16}
                      className="size-4"
                    />
                  </div>
                  <span className="font-medium capitalize">{dep.service}</span>
                  <span className="text-muted-foreground text-xs">
                    (auto-deployed if not present)
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Resource requirements */}
        {(resourceDefaults || resourceLimits) && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-muted-foreground" />
              <h2 className="font-semibold">Resources</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {resourceDefaults && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Requests</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Cpu className="size-3 text-muted-foreground" />
                      <span>{resourceDefaults.cpu}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <HardDrive className="size-3 text-muted-foreground" />
                      <span>{resourceDefaults.memory}</span>
                    </div>
                  </div>
                </div>
              )}
              {resourceLimits && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Limits</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Cpu className="size-3 text-muted-foreground" />
                      <span>{resourceLimits.cpu}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <HardDrive className="size-3 text-muted-foreground" />
                      <span>{resourceLimits.memory}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
