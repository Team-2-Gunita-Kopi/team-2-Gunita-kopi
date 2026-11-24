import type {
  CreateOrderRequest,
  Order,
  OrderListQuery,
  OrderStatus,
  OrderType,
  Page,
} from "@gunita/contracts";
import { AuthenticatedUser } from "@/lib/auth";
import { AppError, dbError, NotFoundError } from "@/lib/errors";
import { pageRange, toPage } from "@/lib/request";
import { manilaDayStart, manilaNextDayStart } from "@/lib/dates";
import { auditAction } from "@/lib/audit";

// --- Checkout ----------------------------------------------------------------------

const isDbId = (v: string | undefined) => !!v && /^[1-9]\d{0,9}$/.test(v);

/** Maps the contract to the jsonb shape process_checkout_transaction expects. */
export function toCheckoutPayload(order: CreateOrderRequest) {
  return {
    client_tx_id: order.clientTxId,
    order_type: order.type,
    payment_method: order.paymentMethod,
    amount_paid: order.paidAmount,
    items: order.items.map((item) => ({
      is_addon: item.isAddon ?? false,
      product_id: item.isAddon ? null : Number(item.productId),
      ingredient_id: item.isAddon ? Number(item.ingredientId) : null,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      customization: item.customization ?? null,
      special_instructions: item.specialInstructions ?? item.notes ?? null,
    })),
  };
}

/**
 * Saves one sale through the atomic checkout function (SDS 2.5) under the caller's token, so RLS
 * and app_user_id() apply. The database rechecks prices and stock, writes order rows, payment and
 * stock-out together, assigns the order_id (queue number) and deduplicates by clientTxId.
 * Business failures come back as AppErrors: STOCK_CONFLICT / PRICE_CONFLICT / CONFLICT (409),
 * VALIDATION (400).
 */
export async function checkout(
  user: AuthenticatedUser,
  order: CreateOrderRequest,
): Promise<{ orderId: number; duplicate: boolean }> {
  if (order.paymentMethod !== "cash") {
    throw new AppError("Payment is cash only", 400, "VALIDATION");
  }
  const badItem = order.items.find(
    (i) => !isDbId(i.isAddon ? i.ingredientId : i.productId),
  );
  if (badItem) {
    throw new AppError(
      `Unknown ${badItem.isAddon ? "ingredient" : "product"} id for '${badItem.productName}'`,
      400,
      "VALIDATION",
    );
  }

  const { data, error } = await user.supabaseClient.rpc(
    "process_checkout_transaction",
    {
      p_order: toCheckoutPayload(order),
    },
  );
  if (error) throw dbError(error);
  const result = data as { order_id: number; duplicate: boolean } | null;
  if (!result?.order_id) {
    throw new AppError("Checkout returned no order", 500, "DATABASE_ERROR");
  }
  return { orderId: result.order_id, duplicate: result.duplicate };
}

// --- Reading orders -----------------------------------------------------------------

const LINE_SELECT =
  "order_line_id, order_id, client_tx_id, user_id, product_id, ingredient_id, is_addon, quantity, unit_price, subtotal, order_type, order_date, status, customization, special_instructions, products(product_name), ingredients(ingredient_name), users(full_name)";

/** Loads whole orders (all rows plus payment), in the order of `orderIds`. */
async function loadOrders(
  user: AuthenticatedUser,
  orderIds: number[],
): Promise<Order[]> {
  if (orderIds.length === 0) return [];
  const [lines, payments] = await Promise.all([
    user.supabaseClient
      .from("orders")
      .select(LINE_SELECT)
      .in("order_id", orderIds)
      .order("order_line_id"),
    user.supabaseClient
      .from("payments")
      .select(
        "order_id, amount_paid, change_amount, payment_method, received_by, date_time",
      )
      .in("order_id", orderIds),
  ]);
  if (lines.error) throw dbError(lines.error);
  if (payments.error) throw dbError(payments.error);

  const orders = new Map<number, Order>();
  for (const r of lines.data) {
    let order = orders.get(r.order_id);
    if (!order) {
      order = {
        orderId: r.order_id,
        clientTxId: r.client_tx_id,
        status: r.status as OrderStatus,
        orderType: r.order_type as OrderType | null,
        orderDate: r.order_date,
        cashierId: r.user_id,
        cashierName: r.users?.full_name ?? null,
        items: [],
        total: 0,
        payment: null,
      };
      orders.set(r.order_id, order);
    }
    order.items.push({
      lineId: r.order_line_id,
      productId: r.product_id,
      ingredientId: r.ingredient_id,
      isAddon: r.is_addon,
      name: r.is_addon
        ? (r.ingredients?.ingredient_name ?? null)
        : (r.products?.product_name ?? null),
      quantity: r.quantity,
      unitPrice: r.unit_price,
      subtotal: r.subtotal,
      customization: r.customization,
      specialInstructions: r.special_instructions,
    });
    order.total = Math.round((order.total + r.subtotal) * 100) / 100;
  }
  for (const p of payments.data) {
    const order = orders.get(p.order_id);
    if (order) {
      order.payment = {
        amountPaid: p.amount_paid,
        changeAmount: p.change_amount,
        paymentMethod: p.payment_method,
        receivedBy: p.received_by,
        dateTime: p.date_time,
      };
    }
  }
  return orderIds.flatMap((id) => orders.get(id) ?? []);
}

/** Full order: items, totals, payment and change. Serves the receipt and order slip (FR-08, FR-09). */
export async function getOrder(
  user: AuthenticatedUser,
  orderId: number,
): Promise<Order> {
  const [order] = await loadOrders(user, [orderId]);
  if (!order) throw new NotFoundError("Order not found");
  return order;
}

/** Order board: newest first, with their items. status filter gives the queue (FR-10). */
export async function listOrders(
  user: AuthenticatedUser,
  q: OrderListQuery,
): Promise<Page<Order>> {
  let query = user.supabaseClient
    .from("v_order_totals")
    .select("order_id", { count: "exact" })
    .order("order_id", { ascending: false })
    .range(...pageRange(q));
  if (q.status) query = query.in("status", q.status);
  if (q.from) query = query.gte("order_date", manilaDayStart(q.from));
  if (q.to) query = query.lt("order_date", manilaNextDayStart(q.to));
  const { data, error, count } = await query;
  if (error) throw dbError(error);
  return toPage(
    await loadOrders(
      user,
      data.map((r) => r.order_id),
    ),
    count,
    q,
  );
}

/**
 * Moves every row of the order to the new status. The database enforces the transitions
 * (pending -> preparing -> completed, pending/preparing -> cancelled) and answers
 * INVALID_TRANSITION (409) otherwise. Who changed it and when goes to the audit log.
 */
export async function updateOrderStatus(
  user: AuthenticatedUser,
  orderId: number,
  status: OrderStatus,
): Promise<Order> {
  const { data, error } = await user.supabaseClient
    .from("orders")
    .update({ status })
    .eq("order_id", orderId)
    .select("order_line_id");
  if (error) throw dbError(error);
  if (data.length === 0) throw new NotFoundError("Order not found");
  await auditAction(user, "order.status", "orders", orderId, { status });
  return getOrder(user, orderId);
}
