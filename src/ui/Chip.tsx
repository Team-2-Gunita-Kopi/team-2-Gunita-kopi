import React from "react";

export type ChipTone = "ok" | "low" | "out" | "coffee" | "moss" | "neutral";

export interface ChipProps {
  tone: ChipTone;
  children: React.ReactNode;
}

export function Chip({ tone, children }: ChipProps) {
  return <span className={tone === "neutral" ? "chip" : `chip chip-${tone}`}>{children}</span>;
}
