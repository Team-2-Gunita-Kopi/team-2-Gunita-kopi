import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlayProvider } from "@/ui";

export function renderWithProviders(ui: React.ReactElement): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OverlayProvider>{ui}</OverlayProvider>
    </QueryClientProvider>,
  );
}
