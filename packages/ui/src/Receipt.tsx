import React from "react";
import { ORDER_TYPE_LABEL } from "@gunita/contracts/ui";
import type { Order } from "@gunita/contracts/ui";
import { formatDateTime, formatPeso, formatQueueNumber } from "./format";
import { Chip } from "./Chip";

export interface ReceiptProps {
  order: Order;
  shopName: string;
  footer: string;
  cashierName: string;
  pendingSync?: boolean;
  /** FR-09 order slip for the staff: the same order without prices or payment. */
  slip?: boolean;
}

function methodLabel(m: string): string {
  const t = m.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Layout from receiptModal() in apps/admin/app.js. */
export function Receipt({
  order,
  shopName,
  footer,
  cashierName,
  pendingSync,
  slip,
}: ReceiptProps) {
  const small = { fontSize: ".78rem" } as const;
  return (
    <div className="print-area">
      <div className="slip">
        <div className="bay-head" lang="tl-Tglg" aria-hidden="true">
          ᜃᜓᜉᜒ
        </div>
        <h3 style={{ textAlign: "center", margin: ".2rem 0" }}>
          {slip ? "Order slip" : shopName}
        </h3>
        <div className="queue-num" style={{ textAlign: "center" }}>
          {formatQueueNumber(order.orderNumber ?? order.id)}
        </div>
        <p
          className="muted"
          style={{ textAlign: "center", margin: "0 0 .5rem" }}
        >
          {ORDER_TYPE_LABEL[order.type]} · {formatDateTime(order.createdAt)}
        </p>
        {pendingSync ? (
          <p style={{ textAlign: "center", margin: "0 0 .5rem" }}>
            <Chip tone="low">Pending sync</Chip>
          </p>
        ) : null}
        <table>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={it.id ?? i}>
                <td>
                  {it.quantity}× {it.productName}
                  {(it.addons ?? []).map((a) => (
                    <React.Fragment key={a.ingredientId}>
                      <br />
                      <span className="muted addon-line">
                        {slip ? (
                          <>
                            + {a.quantity}× {a.label}
                          </>
                        ) : (
                          <>
                            + {a.label}{" "}
                            <span className="num">
                              {formatPeso(a.price * a.quantity)}
                            </span>
                          </>
                        )}
                      </span>
                    </React.Fragment>
                  ))}
                  {it.customization ? (
                    <>
                      <br />
                      <span className="muted" style={small}>
                        {it.customization}
                      </span>
                    </>
                  ) : null}
                  {it.specialInstructions ? (
                    <>
                      <br />
                      <span className="muted" style={small}>
                        Note: {it.specialInstructions}
                      </span>
                    </>
                  ) : null}
                </td>
                {slip ? null : <td className="r">{formatPeso(it.subtotal)}</td>}
              </tr>
            ))}
            {slip ? null : (
              <>
                <tr className="tot">
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td className="r">
                    <strong>{formatPeso(order.totalAmount)}</strong>
                  </td>
                </tr>
                {order.paidAmount > 0 ? (
                  <>
                    <tr>
                      <td className="muted">
                        {methodLabel(order.paymentMethod)}
                      </td>
                      <td className="r muted">
                        {formatPeso(order.paidAmount)}
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">Change</td>
                      <td className="r muted">
                        {formatPeso(order.changeAmount)}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td className="muted">Payment</td>
                    <td className="r muted">Unpaid</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
        <p className="muted" style={{ ...small, margin: ".5rem 0 0" }}>
          Served by {cashierName}
        </p>
        {slip ? null : (
          <p
            className="muted"
            style={{ ...small, textAlign: "center", margin: ".3rem 0 0" }}
          >
            {footer}
          </p>
        )}
      </div>
    </div>
  );
}
