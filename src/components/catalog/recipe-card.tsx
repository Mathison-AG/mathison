"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { Recipe } from "@/types/recipe";

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

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const tier = tierStyles[recipe.tier] ?? defaultTier;
  const iconSrc = recipe.iconUrl || `/icons/${recipe.slug}.svg`;

  return (
    <Link href={`/catalog/${recipe.slug}`} className="block h-full">
      <Card className="group relative flex h-full flex-col gap-4 p-5 transition-colors hover:bg-muted/50">
        {/* Header: icon + name */}
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background">
            <Image
              src={iconSrc}
              alt={recipe.displayName}
              width={24}
              height={24}
              className="size-6"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold leading-tight truncate">
              {recipe.displayName}
            </h3>
            <p className="text-sm text-muted-foreground capitalize">
              {recipe.category}
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
          {recipe.description}
        </p>

        {/* Footer: badges + arrow */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={cn("text-xs", tier.className)}>
              {tier.label}
            </Badge>
            <Badge variant="outline" className="text-xs capitalize">
              {recipe.category}
            </Badge>
          </div>
          <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </Card>
    </Link>
  );
}
