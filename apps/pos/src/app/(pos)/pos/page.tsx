"use client";

import React, { useState } from "react";
import { Button, Dialog } from "@gunita/ui";
import { saveOrderToOutbox } from "@/offline/outbox";
import { CreateOrderRequest } from "@gunita/contracts";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
}

interface CartItem extends MenuItem {
  quantity: number;
}

const MENU_ITEMS: MenuItem[] = [
  { id: "prod-1", name: "Spanish Latte", category: "Coffee", price: 140 },
  { id: "prod-2", name: "Caramel Macchiato", category: "Coffee", price: 150 },
  { id: "prod-3", name: "Americano", category: "Coffee", price: 100 },
  { id: "prod-4", name: "Matcha Latte", category: "Non-Coffee", price: 150 },
  { id: "prod-5", name: "Cold Brew", category: "Coffee", price: 130 },
  { id: "prod-6", name: "Butter Croissant", category: "Pastry", price: 95 },
];

export default function PosPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "qr_code" | "other"
  >("cash");
  const [orderNotice, setOrderNotice] = useState<string | null>(null);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  const totalAmount = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const handleCheckout = async () => {
    // Generate a unique client transaction ID for safe retry / idempotency
    const clientTxId = crypto.randomUUID();

    const orderPayload: CreateOrderRequest = {
      clientTxId,
      type: "dine-in",
      items: cart.map((item) => ({
        productId: item.id,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.price * item.quantity,
      })),
      totalAmount,
      taxAmount: 0,
      discountAmount: 0,
      paidAmount: totalAmount,
      paymentMethod,
    };

    // Save directly to Dexie offline outbox first
    await saveOrderToOutbox(orderPayload);
    // TODO: Connect receipt printer and cash drawer trigger

    setCart([]);
    setIsPaymentOpen(false);
    setOrderNotice(
      `Order ${clientTxId.slice(-6).toUpperCase()} queued in offline outbox!`,
    );
    setTimeout(() => setOrderNotice(null), 4000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-7rem)]">
      {/* Product Menu Grid */}
      <div className="lg:col-span-2 flex flex-col space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            Beverage & Food Menu
          </h2>
          {orderNotice && (
            <span className="text-xs bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-medium">
              {orderNotice}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              type="button"
              className="bg-white p-4 rounded-xl border border-gray-200 hover:border-emerald-600 hover:shadow-md transition text-left flex flex-col justify-between h-32"
            >
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700">
                  {item.category}
                </span>
                <h3 className="text-sm font-semibold text-gray-900 mt-0.5 line-clamp-1">
                  {item.name}
                </h3>
              </div>
              <p className="text-base font-bold text-gray-800">
                ₱{item.price.toFixed(2)}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Cart & Checkout Panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Current Order</h3>
            <span className="text-xs text-gray-500">
              {cart.length} unique items
            </span>
          </div>

          <div className="divide-y divide-gray-100 mt-2 max-h-80 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="text-xs text-gray-400 py-12 text-center">
                Tap items on the menu to add to cart
              </p>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="py-2.5 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      ₱{item.price} × {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-gray-800">
                      ₱{(item.price * item.quantity).toFixed(2)}
                    </span>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-gray-400 hover:text-red-500 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 space-y-3">
          <div className="flex justify-between items-center text-lg font-bold text-gray-900">
            <span>Total:</span>
            <span>₱{totalAmount.toFixed(2)}</span>
          </div>

          <Button
            className="w-full py-3 text-base"
            disabled={cart.length === 0}
            onClick={() => setIsPaymentOpen(true)}
          >
            Charge ₱{totalAmount.toFixed(2)}
          </Button>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        title="Payment & Checkout"
      >
        <div className="space-y-4">
          <div className="text-center py-2 bg-emerald-50 rounded-lg">
            <p className="text-xs text-emerald-800 font-medium">Total Due</p>
            <p className="text-2xl font-bold text-emerald-900">
              ₱{totalAmount.toFixed(2)}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Payment Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["cash", "card", "qr_code", "other"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border uppercase transition-colors ${
                    paymentMethod === method
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900 font-bold"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {method.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-gray-500">
            Note: Order will be recorded to offline IndexedDB outbox with client
            transaction ID before sync.
          </p>

          <div className="flex space-x-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsPaymentOpen(false)}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleCheckout}>
              Complete Sale
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
