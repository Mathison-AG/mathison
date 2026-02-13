"use client";

import { Search } from "lucide-react";
import { useState, useEffect } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Categories ───────────────────────────────────────────

const categories = [
  { value: "all", label: "All" },
  { value: "database", label: "Database" },
  { value: "automation", label: "Automation" },
  { value: "monitoring", label: "Monitoring" },
  { value: "storage", label: "Storage" },
  { value: "analytics", label: "Analytics" }
] as const;

// ─── Component ────────────────────────────────────────────

interface CatalogFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
}

export function CatalogFilters({
  search,
  onSearchChange,
  category,
  onCategoryChange
}: CatalogFiltersProps) {
  // Debounced search input
  const [localSearch, setLocalSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search services..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => onCategoryChange(cat.value)}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              category === cat.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
