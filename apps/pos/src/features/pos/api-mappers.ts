import { ADDON_SELLING_PRICE, productImageSrc } from "@gunita/contracts";
import type {
  CreateOrderRequest as ApiCreateOrderRequest,
  Ingredient as ApiIngredient,
  Order as ApiOrder,
  OrderItem as ApiOrderItem,
  OrderLine as ApiOrderLine,
  Product as ApiProduct,
  SyncResultItem as ApiSyncResultItem,
} from "@gunita/contracts";
import type {
  CreateOrderRequest as UiCreateOrderRequest,
  Order as UiOrder,
  OrderItem as UiOrderItem,
  PosIngredient,
  PosProduct,
  SyncResultItem as UiSyncResultItem,
} from "@gunita/contracts/ui";

// Converts between the API contract (@gunita/contracts, database-shaped: numeric ids, one row per
// order line) and the POS view models (@gunita/contracts/ui). Ids stay the database ids, as strings.

const round2 = (v: number) => Math.round(v * 100) / 100;

export function toPosProduct(p: ApiProduct): PosProduct {
  return {
    id: String(p.id),
    name: p.name,
    category: p.category ?? "Uncategorized",
    sellingPrice: p.price,
    description: p.description ?? undefined,
    // Stored images load through this site's API proxy (private bucket); http(s) URLs as they are.
    imageUrl: productImageSrc(p),
    isActive: p.isAvailable,
    createdAt: p.createdAt,
  };
}

export function toPosIngredient(i: ApiIngredient): PosIngredient {
  return {
    id: String(i.id),
    name: i.name,
    unit: i.unit ?? "",
    currentStock: Math.max(0, i.currentStock),
    minimumStock: i.reorderLevel,
    isLowStock: i.stockStatus !== "available",
    updatedAt: i.updatedAt,
    // Only complete configurations at the fixed price reach the add-on list.
    ...(i.isAddon && i.addonSellingPrice === ADDON_SELLING_PRICE && (i.addonQuantity ?? 0) > 0
      ? { addon: { price: ADDON_SELLING_PRICE, quantity: i.addonQuantity! } }
      : {}),
  };
}

const isDbId = (v: string) => /^[1-9]\d*$/.test(v);

/** Thrown when a queued order cannot be expressed as database rows (e.g. a demo add-on id). */
export class UnmappableOrderError extends Error {}

/**
 * One UI order item (product with nested add-ons) becomes one product row plus one row per add-on
 * (SDS 3.5.8, FR-02/FR-03). An add-on row is one inventory ingredient sold at its fixed add-on price;
 * the database rechecks the configuration, the price and the stock.
 */
function toApiItems(item: UiOrderItem): ApiOrderItem[] {
  if (!isDbId(item.productId)) {
    throw new UnmappableOrderError(`"${item.productName}" is not a saved product`);
  }
  const rows: ApiOrderItem[] = [
    {
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: round2(item.unitPrice * item.quantity),
      customization: item.customization || undefined,
      specialInstructions: item.specialInstructions || undefined,
    },
  ];
  for (const a of item.addons ?? []) {
    if (!isDbId(a.ingredientId)) {
      throw new UnmappableOrderError(`Add-on "${a.label}" is not linked to an inventory ingredient`);
    }
    // One selection per drink: quantity = number of selections, unit price = price per selection.
    rows.push({
      isAddon: true,
      ingredientId: a.ingredientId,
      productName: a.label,
      quantity: item.quantity,
      unitPrice: a.price,
      subtotal: round2(a.price * item.quantity),
    });
  }
  return rows;
}

/** Outbox order (UI shape) to the API checkout/sync body. Online orders are pre-orders (FR-01). */
export function toApiOrder(o: UiCreateOrderRequest): ApiCreateOrderRequest {
  return {
    clientTxId: o.clientTxId,
    type: o.type === "online" ? "pre-order" : o.type,
    items: o.items.flatMap(toApiItems),
    totalAmount: o.totalAmount,
    taxAmount: 0,
    discountAmount: 0,
    paidAmount: o.paidAmount,
    paymentMethod: "cash",
    notes: o.notes,
  };
}

/** conflict (stock, price or availability changed, FR-60) is shown to staff as a failed order. */
export function toUiSyncResult(r: ApiSyncResultItem): UiSyncResultItem {
  return {
    transactionId: r.transactionId,
    orderId: r.orderId,
    orderNumber: r.orderId,
    status: r.status === "conflict" ? "failed" : r.status,
    error: r.status === "conflict" || r.status === "failed" ? (r.error ?? "The server rejected this order.") : undefined,
  };
}

function toUiItem(line: ApiOrderLine): UiOrderItem {
  return {
    id: String(line.lineId),
    productId: String(line.productId ?? ""),
    productName: line.name ?? "Item",
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    subtotal: line.subtotal,
    addons: [],
    customization: line.customization ?? undefined,
    specialInstructions: line.specialInstructions ?? undefined,
  };
}

/**
 * Order rows back to receipt items. Add-on rows follow their product row (the POS sends them in
 * that order), so each add-on joins the product row before it.
 */
export function toUiOrder(o: ApiOrder): UiOrder {
  const items: UiOrderItem[] = [];
  for (const line of [...o.items].sort((a, b) => a.lineId - b.lineId)) {
    const owner = items[items.length - 1];
    if (line.isAddon && owner) {
      owner.addons!.push({
        ingredientId: String(line.ingredientId ?? ""),
        label: line.name ?? "Add-on",
        quantity: line.quantity / owner.quantity,
        price: round2(line.subtotal / owner.quantity),
      });
      owner.subtotal = round2(owner.subtotal + line.subtotal);
    } else {
      items.push(toUiItem(line));
    }
  }
  return {
    id: String(o.orderId),
    clientTxId: o.clientTxId,
    orderNumber: String(o.orderId),
    status: o.status,
    type: o.orderType ?? "dine-in",
    items,
    totalAmount: o.total,
    taxAmount: 0,
    discountAmount: 0,
    paidAmount: o.payment?.amountPaid ?? o.total,
    changeAmount: o.payment?.changeAmount ?? 0,
    paymentMethod: "cash",
    createdAt: o.orderDate,
    createdBy: String(o.cashierId ?? ""),
    cashierName: o.cashierName ?? undefined,
  };
}
