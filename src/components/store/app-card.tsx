"use client";

import Image from "next/image";
import Link from "next/link";
import { Download } from "lucide-react";

import { Card } from "@/components/ui/card";

import type { Recipe } from "@/types/recipe";

interface AppCardProps {
  recipe: Recipe;
  variant?: "default" | "featured";
}

function formatInstallCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function AppCard({ recipe, variant = "default" }: AppCardProps) {
  const iconSrc = recipe.iconUrl || `/icons/${recipe.slug}.svg`;
  const isFeatured = variant === "featured";

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
          <span className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-medium h-8 px-3 shadow-sm">
            Get
          </span>
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
