"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useCatalog } from "@/features/pos/hooks/use-catalog";
import { useCartStore, selectCount, selectTotal } from "@/features/pos/cart.store";
import { ALL, CategoryTabs } from "@/features/pos/components/CategoryTabs";
import { PosSearch } from "@/features/pos/components/PosSearch";
import { MenuGrid } from "@/features/pos/components/MenuGrid";
import { CartPanel } from "@/features/pos/components/CartPanel";
import { CartFab } from "@/features/pos/components/CartFab";
import { CustomizeModal } from "@/features/pos/components/CustomizeModal";
import { PaymentModal } from "@/features/pos/components/PaymentModal";
import { ReceiptModal } from "@/features/pos/components/ReceiptModal";
import { checkout, recordToOrder } from "@/features/pos/checkout";
import { getSession } from "@/features/auth";
import type { Order } from "@gunita/contracts";

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

  const products = useMemo(
    () =>
      (data?.products ?? []).filter(
        (p) => (category === ALL || p.category === category) && (!query || p.name.toLowerCase().includes(query)),
      ),
    [data, category, query],
  );

  const customizeLine = lines.find((l) => l.lineId === customizeId);
  const customizeProduct = customizeLine && data?.products.find((p) => p.id === customizeLine.productId);
  const stockById = useMemo(
    () => Object.fromEntries((data?.ingredients ?? []).map((i) => [i.id, i.currentStock])),
    [data],
  );

  const settings = data?.settings;

  const confirmPayment = async ({ type, paid }: { type: Order["type"]; paid: number }) => {
    const cashier = getSession();
    if (!cashier) throw new Error("You are signed out. Please sign in again.");
    const { record, order } = await checkout({ lines, type, paid, cashier });
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
          <CategoryTabs active={category} onChange={setCategory} />
          <PosSearch onSearch={onSearch} />
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
