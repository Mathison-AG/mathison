"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  BookOpen,
  CheckCircle2,
  Star,
  Globe,
  Check,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InstallButton } from "./install-button";
import { InstallProgress } from "./install-progress";
import { InstallSuccess } from "./install-success";
import { useInstall } from "@/hooks/use-install";

import type { Recipe } from "@/types/recipe";

interface AppDetailProps {
  recipe: Recipe;
  isInstalled?: boolean;
}

function formatInstallCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function AppDetail({ recipe, isInstalled = false }: AppDetailProps) {
  const iconSrc = recipe.iconUrl || `/icons/${recipe.slug}.svg`;
  const { phase, deployment, error, install } = useInstall();
  const hasDeps = recipe.dependencies.length > 0;

  function handleInstall() {
    install(recipe.slug);
  }

  const showProgress = phase === "installing" || phase === "polling";
  const showSuccess = phase === "success";
  const showInstallButton = !showProgress && !showSuccess;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Apps
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-5">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl border bg-background shadow-sm">
          <Image
            src={iconSrc}
            alt={recipe.displayName}
            width={48}
            height={48}
            className="size-12"
            priority
          />
        </div>

        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{recipe.displayName}</h1>
            {recipe.featured && (
              <Badge
                variant="secondary"
                className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              >
                <Star className="size-3 fill-current" />
                Featured
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground capitalize">
            {recipe.category}
          </p>
          {recipe.installCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Download className="size-3" />
              {formatInstallCount(recipe.installCount)} installs
            </div>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          {showInstallButton && (
            <>
              {isInstalled ? (
                <Link href="/apps">
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-xl px-8 border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/5"
                  >
                    <Check className="size-4" />
                    Installed
                  </Button>
                </Link>
              ) : (
                <InstallButton
                  phase={phase}
                  onInstall={handleInstall}
                  onRetry={handleInstall}
                  size="lg"
                  className="rounded-xl px-8"
                />
              )}
              <span className="text-xs text-muted-foreground">Free</span>
            </>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 flex items-start gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-destructive/10 shrink-0">
            <span className="text-destructive text-sm">!</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive font-medium">Installation failed</p>
            <p className="text-sm text-destructive/80 mt-0.5">{error}</p>
            <button
              onClick={handleInstall}
              className="text-sm text-destructive font-medium mt-2 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Install progress (replaces description area when installing) */}
      {showProgress && (
        <InstallProgress
          appName={recipe.displayName}
          hasDeps={hasDeps}
          deployment={deployment}
        />
      )}

      {/* Install success */}
      {showSuccess && (
        <InstallSuccess
          appName={recipe.displayName}
          appUrl={deployment?.url ?? null}
          gettingStarted={recipe.gettingStarted}
        />
      )}

      {/* Description */}
      <div className="space-y-2">
        <p className="text-base text-foreground/90 leading-relaxed">
          {recipe.shortDescription || recipe.description}
        </p>
        {recipe.shortDescription && recipe.description !== recipe.shortDescription && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {recipe.description}
          </p>
        )}
      </div>

      <Separator />

      {/* Use Cases */}
      {recipe.useCases.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What is this good for?</h2>
          <ul className="space-y-2">
            {recipe.useCases.map((useCase, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="size-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-sm text-foreground/90">{useCase}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipe.useCases.length > 0 && <Separator />}

      {/* Getting Started */}
      {recipe.gettingStarted && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Getting Started</h2>
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90">
              {recipe.gettingStarted.split("\n").map((line, i) => {
                if (line.startsWith("## ")) {
                  return (
                    <h3 key={i} className="text-base font-semibold mt-4 mb-2">
                      {line.replace("## ", "")}
                    </h3>
                  );
                }
                if (line.startsWith("### ")) {
                  return (
                    <h4 key={i} className="text-sm font-semibold mt-3 mb-1">
                      {line.replace("### ", "")}
                    </h4>
                  );
                }
                if (line.startsWith("- ") || line.startsWith("* ")) {
                  return (
                    <p key={i} className="text-sm ml-4 my-0.5">
                      &bull; {line.replace(/^[-*] /, "")}
                    </p>
                  );
                }
                if (line.match(/^\d+\. /)) {
                  return (
                    <p key={i} className="text-sm ml-4 my-0.5">
                      {line}
                    </p>
                  );
                }
                if (line.trim() === "") return <br key={i} />;
                return (
                  <p key={i} className="text-sm my-1">
                    {line}
                  </p>
                );
              })}
            </div>
          </section>
          <Separator />
        </>
      )}

      {/* Screenshots placeholder */}
      {recipe.screenshots.length > 0 && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Screenshots</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recipe.screenshots.map((src, i) => (
                <div
                  key={i}
                  className="shrink-0 w-72 h-44 rounded-xl border bg-muted/30 overflow-hidden"
                >
                  <Image
                    src={src}
                    alt={`${recipe.displayName} screenshot ${i + 1}`}
                    width={288}
                    height={176}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </section>
          <Separator />
        </>
      )}

      {/* Links */}
      {(recipe.websiteUrl || recipe.documentationUrl) && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Links</h2>
          <div className="flex flex-wrap gap-3">
            {recipe.websiteUrl && (
              <a
                href={recipe.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <Globe className="size-4 text-muted-foreground" />
                Website
                <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            )}
            {recipe.documentationUrl && (
              <a
                href={recipe.documentationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <BookOpen className="size-4 text-muted-foreground" />
                Documentation
                <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            )}
          </div>
        </section>
      )}

      {/* Bottom padding */}
      <div className="h-8" />
    </div>
  );
}
