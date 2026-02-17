"use client";

import { cn } from "@/lib/utils";

const categories = [
  { value: "all", label: "All" },
  { value: "automation", label: "Automation" },
  { value: "monitoring", label: "Monitoring" },
  { value: "database", label: "Databases" },
  { value: "storage", label: "Storage" },
  { value: "analytics", label: "Analytics" },
] as const;

interface CategoryFiltersProps {
  selected: string;
  onChange: (value: string) => void;
}

export function CategoryFilters({ selected, onChange }: CategoryFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(cat.value)}
          className={cn(
            "inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            selected === cat.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/60 text-foreground/70 hover:bg-muted hover:text-foreground"
          )}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
