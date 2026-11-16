# Gunita Kopi API Specification

This document details all backend route handlers exposed by `@gunita/api`, including role-based access control requirements and functional purposes.

## Security & Access Summary

- **Authentication**: Bearer token issued by Supabase Auth sent via HTTP `Authorization: Bearer <token>` header.
- **Authorization**: Server-side validation via `requireUser` and `requireRole` on every protected endpoint.
- **Row Level Security**: The API creates a scoped Supabase client with the caller's JWT, applying database RLS policies. The service role key is strictly isolated to employee provisioning and audit logging.
- **CORS**: Restricted exclusively to origins specified in `ALLOWED_ORIGINS` (`apps/admin` and `apps/pos`).

## Route Registry

| Method | Endpoint                    | Authorized Roles         | Purpose                                                                                     | Response Shape                                                       |
| ------ | --------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET`  | `/api/health`               | Anyone (Public)          | Health and liveness probe for monitoring and connection checks                              | `ApiResponse<{ status: string, uptime: number, timestamp: string }>` |
| `POST` | `/api/sync`                 | `barista`                | Ingests offline outbox order batches, executing transactional checkout and stock deductions | `ApiResponse<SyncResponse>`                                          |
| `POST` | `/api/admin/employees`      | `owner_admin`            | Provisions new employee accounts with `app_metadata.role` (No public registration)          | `ApiResponse<EmployeeResponse>`                                      |
| `GET`  | `/api/orders`               | `barista`, `owner_admin` | Lists orders. Baristas view shift/station orders; Owner views all orders monorepo-wide      | `ApiResponse<Order[]>`                                               |
| `POST` | `/api/orders`               | `barista`, `owner_admin` | Submits a live order immediately for processing via checkout RPC                            | `ApiResponse<Order>`                                                 |
| `GET`  | `/api/orders/[id]`          | `barista`, `owner_admin` | Retrieves full order details including line items and payment breakdown                     | `ApiResponse<Order>`                                                 |
| `GET`  | `/api/products`             | `owner_admin`            | Retrieves product catalog with recipe cost breakdowns and profit margins                    | `ApiResponse<Product[]>`                                             |
| `POST` | `/api/products`             | `owner_admin`            | Creates a new beverage or food item in the product catalog                                  | `ApiResponse<Product>`                                               |
| `GET`  | `/api/products/[id]/recipe` | `owner_admin`            | Fetches ingredient recipe formula and calculated COGS for a product                         | `ApiResponse<Product>`                                               |
| `PUT`  | `/api/products/[id]/recipe` | `owner_admin`            | Updates ingredient bill of materials and recalculates profit margin                         | `ApiResponse<Product>`                                               |
| `GET`  | `/api/ingredients`          | `barista`, `owner_admin` | Lists ingredients with current stock levels, units, and minimum stock alerts                | `ApiResponse<Ingredient[]>`                                          |
| `POST` | `/api/ingredients`          | `barista`, `owner_admin` | Adds a new raw ingredient to the inventory master list                                      | `ApiResponse<Ingredient>`                                            |
| `GET`  | `/api/stock-transactions`   | `barista`, `owner_admin` | Fetches historical log of inventory additions, deductions, waste, and adjustments           | `ApiResponse<StockTransaction[]>`                                    |
| `POST` | `/api/stock-transactions`   | `barista`, `owner_admin` | Logs a stock movement (stock in, waste deduction, manual count adjustment)                  | `ApiResponse<StockTransaction>`                                      |
| `GET`  | `/api/suppliers`            | `owner_admin`            | Lists ingredient and bean suppliers with contact records                                    | `ApiResponse<Supplier[]>`                                            |
| `POST` | `/api/suppliers`            | `owner_admin`            | Adds a new supplier record to the directory                                                 | `ApiResponse<Supplier>`                                              |
| `GET`  | `/api/users`                | `owner_admin`            | Lists employee directory, account statuses, and assigned roles                              | `ApiResponse<UserProfile[]>`                                         |
| `GET`  | `/api/reports/[type]`       | `owner_admin`            | Generates aggregated report data (`daily`, `monthly`, `best-sellers`, `stock-status`)       | `ApiResponse<unknown>`                                               |
| `GET`  | `/api/dashboard`            | `owner_admin`            | Returns aggregated metrics for the Owner dashboard overview                                 | `ApiResponse<DashboardStats>`                                        |
| `GET`  | `/api/receipts`             | `barista`, `owner_admin` | Generates a time-limited signed download link from Supabase Storage for order receipt PDF   | `ApiResponse<ReceiptResponse>`                                       |
| `POST` | `/api/receipts`             | `barista`, `owner_admin` | Creates a new receipt artifact and generates its signed download link                       | `ApiResponse<ReceiptResponse>`                                       |
