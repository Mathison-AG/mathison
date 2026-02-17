"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

interface StoreSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function StoreSearch({
  value,
  onChange,
  placeholder = "Search apps...",
}: StoreSearchProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(localValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [localValue, onChange]);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className="relative w-full max-w-xl mx-auto">
      <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        className="h-12 pl-11 pr-4 text-base rounded-xl border-border/50 bg-muted/30 focus-visible:bg-background transition-colors"
      />
    </div>
  );
}
