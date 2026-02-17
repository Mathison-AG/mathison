"use client";

import Image from "next/image";
import Link from "next/link";
import { Download, Check } from "lucide-react";

import { Card } from "@/components/ui/card";

import type { Recipe } from "@/types/recipe";

interface AppCardProps {
  recipe: Recipe;
  variant?: "default" | "featured";
  isInstalled?: boolean;
  onInstall?: (recipe: Recipe) => void;
}

function formatInstallCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function AppCard({
  recipe,
  variant = "default",
  isInstalled = false,
  onInstall,
}: AppCardProps) {
  const iconSrc = recipe.iconUrl || `/icons/${recipe.slug}.svg`;
  const isFeatured = variant === "featured";

  function handleGetClick(e: React.MouseEvent) {
    if (isInstalled) return; // "Installed" badge doesn't trigger install
    e.preventDefault();
    e.stopPropagation();
    onInstall?.(recipe);
  }

  return (
    <Link href={`/catalog/${recipe.slug}`} className="block h-full group">
      <Card
        className={`relative flex h-full flex-col items-center gap-3 p-6 transition-all duration-200 hover:shadow-md hover:border-primary/20 ${
          isFeatured ? "bg-gradient-to-b from-primary/5 to-transparent" : ""
        }`}
      >
        {/* App Icon */}
        <div
          className={`flex items-center justify-center rounded-2xl border bg-background shadow-sm ${
            isFeatured ? "size-20" : "size-16"
          }`}
        >
          <Image
            src={iconSrc}
            alt={recipe.displayName}
            width={isFeatured ? 48 : 36}
            height={isFeatured ? 48 : 36}
            className={isFeatured ? "size-12" : "size-9"}
          />
        </div>

        {/* App Name & Category */}
        <div className="text-center space-y-0.5 min-w-0 w-full">
          <h3 className="font-semibold leading-tight truncate">
            {recipe.displayName}
          </h3>
          <p className="text-xs text-muted-foreground capitalize">
            {recipe.category}
          </p>
        </div>

        {/* Short Description */}
        <p className="text-sm text-muted-foreground text-center line-clamp-2 flex-1">
          {recipe.shortDescription || recipe.description}
        </p>

        {/* Footer: Install Button + Count */}
        <div className="flex items-center gap-3 w-full mt-auto pt-1">
          {isInstalled ? (
            <Link
              href="/apps"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-500/30 text-green-600 dark:text-green-400 text-xs font-medium h-8 px-3 hover:bg-green-500/5 transition-colors"
            >
              <Check className="size-3.5" />
              Installed
            </Link>
          ) : (
            <button
              onClick={handleGetClick}
              className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-medium h-8 px-3 shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Get
            </button>
          )}
          {recipe.installCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Download className="size-3" />
              {formatInstallCount(recipe.installCount)}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
