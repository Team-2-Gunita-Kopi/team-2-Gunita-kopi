"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@/ui";

const DEBOUNCE_MS = 200;

export function PosSearch({ onSearch }: { onSearch: (q: string) => void }) {
  const [value, setValue] = useState("");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => onSearch(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, onSearch]);

  return (
    <label className="field pos-search">
      <Icon name="search" aria-hidden="true" />
      <input
        type="search"
        aria-label="Search menu"
        placeholder="Search menu…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </label>
  );
}
