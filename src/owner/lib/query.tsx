"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Shared options for owner queries that must pick up barista activity (orders, dashboard). */
export const LIVE_QUERY_OPTIONS = { refetchInterval: 5000, refetchOnWindowFocus: true } as const;

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
