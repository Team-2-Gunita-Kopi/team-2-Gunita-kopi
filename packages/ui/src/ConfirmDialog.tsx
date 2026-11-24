"use client";

import React, { useRef } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  opts,
  onResult,
}: {
  opts: ConfirmOptions | null;
  onResult: (confirmed: boolean) => void;
}) {
  const last = useRef<ConfirmOptions | null>(null);
  if (opts) last.current = opts;
  const o = last.current;
  return (
    <Dialog isOpen={!!opts} onClose={() => onResult(false)} title={o?.title ?? "Please confirm"}>
      <div className="confirm-body">{o?.message}</div>
      <div className="modal-actions">
        <Button onClick={() => onResult(false)}>Cancel</Button>
        <Button variant={o?.danger ? "danger" : "primary"} onClick={() => onResult(true)}>
          {o?.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </Dialog>
  );
}
