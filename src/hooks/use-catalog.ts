"use client";

import { useQuery } from "@tanstack/react-query";

import type { Recipe } from "@/types/recipe";

export function useCatalog(search?: string, category?: string) {
  return useQuery<Recipe[]>({
    queryKey: ["catalog", search, category],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category && category !== "all") params.set("category", category);
      const res = await fetch(`/api/catalog?${params}`);
      if (!res.ok) throw new Error("Failed to fetch catalog");
      return res.json();
    }
  });
}

export function useRecipe(slug: string) {
  return useQuery<Recipe>({
    queryKey: ["catalog", slug],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/${slug}`);
      if (!res.ok) throw new Error("Failed to fetch recipe");
      return res.json();
    },
    enabled: !!slug
  });
}
