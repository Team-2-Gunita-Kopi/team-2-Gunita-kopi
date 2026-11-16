"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog, type ConfirmOptions } from "./ConfirmDialog";
import { ToastRegion, type ToastItem } from "./Toast";

type ToastFn = (message: string, isError?: boolean) => void;
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const OverlayContext = createContext<{ toast: ToastFn; confirm: ConfirmFn } | null>(null);

const TOAST_MS = 3600;

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setMounted(true);
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  const toast = useCallback<ToastFn>((message, isError) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, isError: !!isError }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((t) => t.filter((x) => x.id !== id));
    }, TOAST_MS);
    timers.current.add(timer);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setPending({ opts, resolve })),
    [],
  );

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  const ctx = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <OverlayContext.Provider value={ctx}>
      {children}
      {mounted && createPortal(<ToastRegion toasts={toasts} />, document.body)}
      <ConfirmDialog opts={pending?.opts ?? null} onResult={settle} />
    </OverlayContext.Provider>
  );
}

function useOverlays(hook: string) {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error(`${hook} must be used inside <OverlayProvider>`);
  return ctx;
}

export function useToast(): ToastFn {
  return useOverlays("useToast").toast;
}

export function useConfirm(): ConfirmFn {
  return useOverlays("useConfirm").confirm;
}
