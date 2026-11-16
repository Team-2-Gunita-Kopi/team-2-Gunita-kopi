"use client";

import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Sticky dialogs ignore Esc and backdrop clicks (only explicit actions close them). */
  sticky?: boolean;
  wide?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Dialog: React.FC<DialogProps> = ({ isOpen, onClose, title, children, sticky, wide }) => {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    if (modal) {
      const first = modal.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? modal).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      const el = modalRef.current;
      if (e.key === "Escape") {
        if (!sticky) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const active = document.activeElement;
      const outside = !el.contains(active);
      if (e.shiftKey && (active === firstEl || active === el || outside)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || outside)) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [isOpen, sticky]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (!sticky && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className={wide ? "modal wide" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId}>
          {title}
          <button type="button" className="close-x" aria-label="Close dialog" onClick={onClose}>
            <Icon name="x" />
          </button>
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export const Modal = Dialog;
