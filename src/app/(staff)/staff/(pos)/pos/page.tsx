"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useCatalog } from "@/staff/features/pos/hooks/use-catalog";
import { useCartStore, selectCount, selectTotal } from "@/staff/features/pos/cart.store";
import { ALL, CategoryTabs } from "@/staff/features/pos/components/CategoryTabs";
import { PosSearch } from "@/staff/features/pos/components/PosSearch";
import { MenuGrid } from "@/staff/features/pos/components/MenuGrid";
import { CartPanel } from "@/staff/features/pos/components/CartPanel";
import { CartFab } from "@/staff/features/pos/components/CartFab";
import { CustomizeModal } from "@/staff/features/pos/components/CustomizeModal";
import { PaymentModal } from "@/staff/features/pos/components/PaymentModal";
import { ReceiptModal } from "@/staff/features/pos/components/ReceiptModal";
import { checkout, recordToOrder } from "@/staff/features/pos/checkout";
import { getSession } from "@/staff/features/auth";
import { formatTime } from "@/ui";
import { USE_MOCKS } from "@/staff/lib/use-mocks";
import { isOnline } from "@/staff/lib/connectivity";
import type { Order } from "@/contracts/ui";

export default function PosPage() {
  const { data, isPending, error, refetch } = useCatalog();
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [customizeId, setCustomizeId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<{ order: Order; pendingSync: boolean; cashierName: string } | null>(null);
  const lines = useCartStore((s) => s.lines);
  const add = useCartStore((s) => s.add);
  const count = useCartStore(selectCount);
  const total = useCartStore(selectTotal);

  const onSearch = useCallback((q: string) => setQuery(q.trim().toLowerCase()), []);

  const availableProducts = useMemo(
    () => (data?.products ?? []).filter((p) => p.isActive),
    [data],
  );
  const products = useMemo(
    () =>
      availableProducts.filter(
        (p) => (category === ALL || p.category === category) && (!query || p.name.toLowerCase().includes(query)),
      ),
    [availableProducts, category, query],
  );

  // Real mode: the categories the saved products use (the official menu's), in the order they arrive.
  const categories = useMemo(
    () => (USE_MOCKS ? undefined : [...new Set(availableProducts.map((p) => p.category))]),
    [availableProducts],
  );

  const customizeLine = lines.find((l) => l.lineId === customizeId);
  const customizeProduct = customizeLine && data?.products.find((p) => p.id === customizeLine.productId);
  const stockById = useMemo(
    () => Object.fromEntries((data?.ingredients ?? []).map((i) => [i.id, i.currentStock])),
    [data],
  );

  const settings = data?.settings;

  const confirmPayment = async ({ type, paid }: { type: Order["type"]; paid: number }) => {
    if (isOnline()) {
      const latest = await refetch();
      const currentProducts = latest.data?.products ?? data?.products ?? [];
      const unavailable = lines.find(
        (line) => !currentProducts.some((product) => product.id === line.productId && product.isActive),
      );
      if (unavailable) {
        throw new Error(`${unavailable.productName} is no longer available. Remove it from the cart.`);
      }
    }

    const cashier = getSession();
    if (!cashier) throw new Error("You are signed out. Please sign in again.");
    const { record, order } = await checkout({ lines, type, paid, cashier });
    if (record.status === "failed" && record.rejected) {
      throw new Error(record.errorMessage ?? "The server rejected this order. Check product availability and try again.");
    }
    setReceipt({
      order: order ?? recordToOrder(record, cashier),
      pendingSync: record.status !== "synced",
      cashierName: cashier.fullName,
    });
    setPaying(false);
  };

  const newOrder = () => {
    useCartStore.getState().clear();
    setReceipt(null);
    setSheetOpen(false);
  };

  return (
    <div className="pos-wrap">
      <div className="pos-menu">
        <div className="pos-tools">
          <CategoryTabs active={category} onChange={setCategory} categories={categories} />
          <PosSearch onSearch={onSearch} />
          {data?.updatedAt ? <span className="muted pos-updated">Last updated {formatTime(data.updatedAt)}</span> : null}
        </div>
        {isPending ? (
          <p className="muted" role="status">
            Loading menu…
          </p>
        ) : error ? (
          <div role="alert">
            <p>{error instanceof Error ? error.message : "Could not load the menu."}</p>
            <button type="button" className="btn" onClick={() => void refetch()}>
              Retry
            </button>
          </div>
        ) : (
          <MenuGrid products={products} ingredients={data.ingredients} onAdd={add} />
        )}
      </div>
      <CartPanel open={sheetOpen} onCustomize={setCustomizeId} onCharge={() => setPaying(true)} />
      {customizeLine && customizeProduct ? (
        <CustomizeModal
          key={customizeLine.lineId}
          line={customizeLine}
          product={customizeProduct}
          stockById={stockById}
          ingredients={data?.ingredients}
          onClose={() => setCustomizeId(null)}
        />
      ) : null}
      {paying ? <PaymentModal total={total} onConfirm={confirmPayment} onClose={() => setPaying(false)} /> : null}
      {receipt ? (
        <ReceiptModal
          order={receipt.order}
          pendingSync={receipt.pendingSync}
          shopName={settings?.shopName ?? "Gunita Kopi"}
          footer={settings?.receiptFooter ?? "Salamat po! Come again."}
          cashierName={receipt.cashierName}
          onNewOrder={newOrder}
        />
      ) : null}
      <CartFab count={count} total={total} onClick={() => setSheetOpen((o) => !o)} />
    </div>
  );
}
