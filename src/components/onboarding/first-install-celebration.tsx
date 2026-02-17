"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, ArrowRight, PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";

// ─── Lightweight CSS confetti ────────────────────────────

interface ConfettiPiece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  rotation: number;
}

const CONFETTI_COLORS = [
  "#f43f5e",
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
];

function generatePieces(): ConfettiPiece[] {
  return Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1.5,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? "#f43f5e",
    size: 4 + Math.random() * 6,
    rotation: Math.random() * 360,
  }));
}

function Confetti() {
  // Generate pieces once on mount via useMemo (no deps = stable across renders)
  const pieces = useMemo(() => generatePieces(), []);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${piece.left}%`,
            top: "-10px",
            width: `${piece.size}px`,
            height: `${piece.size * 0.6}px`,
            backgroundColor: piece.color,
            borderRadius: "1px",
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            transform: `rotate(${piece.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// ─── First install celebration ───────────────────────────

interface FirstInstallCelebrationProps {
  appName: string;
  appUrl: string | null;
  gettingStarted: string | null;
}

export function FirstInstallCelebration({
  appName,
  appUrl,
  gettingStarted,
}: FirstInstallCelebrationProps) {
  const [showConfetti, setShowConfetti] = useState(true);

  const dismissConfetti = useCallback(() => {
    setShowConfetti(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(dismissConfetti, 4000);
    return () => clearTimeout(timer);
  }, [dismissConfetti]);

  return (
    <>
      {showConfetti && <Confetti />}

      <div className="rounded-xl border bg-card p-6 space-y-5">
        {/* Celebration header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-green-500/10">
            <PartyPopper className="size-7 text-green-500" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">
              {appName} is ready!
            </h3>
            <p className="text-sm text-muted-foreground">
              Congratulations on installing your first app! Here&apos;s how to
              get started.
            </p>
          </div>
        </div>

        {/* Open app button */}
        {appUrl && (
          <a href={appUrl} target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="w-full rounded-xl">
              Open {appName}
              <ExternalLink className="size-4" />
            </Button>
          </a>
        )}

        {/* Getting started content */}
        {gettingStarted && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Getting started
            </h4>
            <div className="text-sm text-foreground/80 space-y-1">
              {gettingStarted.split("\n").map((line, i) => {
                if (line.trim() === "") return null;
                if (line.startsWith("## ") || line.startsWith("### ")) {
                  return (
                    <p key={i} className="font-medium mt-2">
                      {line.replace(/^#{2,3}\s/, "")}
                    </p>
                  );
                }
                if (line.match(/^\d+\.\s/)) {
                  return (
                    <p key={i} className="ml-1">
                      {line}
                    </p>
                  );
                }
                if (line.startsWith("- ") || line.startsWith("* ")) {
                  return (
                    <p key={i} className="ml-3">
                      &bull; {line.replace(/^[-*]\s/, "")}
                    </p>
                  );
                }
                return <p key={i}>{line}</p>;
              })}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-2">
          <Link href="/apps">
            <Button variant="outline" className="w-full rounded-xl">
              <CheckCircle2 className="size-4" />
              View in My Apps
            </Button>
          </Link>
          <Link href="/">
            <Button
              variant="ghost"
              className="w-full rounded-xl text-muted-foreground"
            >
              Explore more apps
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
