"use client";

import { useQuery } from "@tanstack/react-query";
import { posData } from "../index";

export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: () => posData.getCatalog(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}
