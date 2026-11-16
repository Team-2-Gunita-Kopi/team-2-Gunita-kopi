import { CreateOrderRequest, Order } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function listOrders(_user: AuthenticatedUser): Promise<Order[]> {
  // TODO: Query orders table using user.supabaseClient (RLS applies)
  // If owner_admin, returns all orders; if barista, returns their own / active shift orders
  throw new NotImplementedError("List orders service is not implemented yet.");
}

export async function getOrderById(
  _user: AuthenticatedUser,
  _orderId: string,
): Promise<Order> {
  // TODO: Query single order by ID via user.supabaseClient
  throw new NotImplementedError(
    "Get order by ID service is not implemented yet.",
  );
}

export async function createOrder(
  _user: AuthenticatedUser,
  _data: CreateOrderRequest,
): Promise<Order> {
  // TODO: Invoke process_checkout_transaction RPC via user.supabaseClient
  throw new NotImplementedError("Create order service is not implemented yet.");
}
