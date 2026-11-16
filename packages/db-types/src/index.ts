/**
 * Supabase Database Type Definitions
 * Generated via `pnpm db:types` (`supabase gen types typescript`).
 *
 * Current status: Placeholder types until database migrations are applied.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_user_id: string;
          email: string;
          full_name: string;
          role: "owner_admin" | "barista";
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          email: string;
          full_name: string;
          role: "owner_admin" | "barista";
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          email?: string;
          full_name?: string;
          role?: "owner_admin" | "barista";
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      suppliers: {
        Row: {
          id: string;
          name: string;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
      };
      ingredients: {
        Row: {
          id: string;
          name: string;
          sku: string | null;
          unit: string;
          current_stock: number;
          minimum_stock: number;
          unit_cost: number;
          supplier_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sku?: string | null;
          unit: string;
          current_stock?: number;
          minimum_stock?: number;
          unit_cost?: number;
          supplier_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sku?: string | null;
          unit?: string;
          current_stock?: number;
          minimum_stock?: number;
          unit_cost?: number;
          supplier_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          sku: string | null;
          category: string;
          selling_price: number;
          cost_price: number;
          image_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sku?: string | null;
          category: string;
          selling_price: number;
          cost_price?: number;
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sku?: string | null;
          category?: string;
          selling_price?: number;
          cost_price?: number;
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_ingredients: {
        Row: {
          id: string;
          product_id: string;
          ingredient_id: string;
          quantity: number;
        };
        Insert: {
          id?: string;
          product_id: string;
          ingredient_id: string;
          quantity: number;
        };
        Update: {
          id?: string;
          product_id?: string;
          ingredient_id?: string;
          quantity?: number;
        };
      };
      product_costing: {
        Row: {
          product_id: string;
          total_cost: number;
          selling_price: number;
          gross_margin_percent: number;
          last_calculated_at: string;
        };
        Insert: {
          product_id: string;
          total_cost: number;
          selling_price: number;
          gross_margin_percent: number;
          last_calculated_at?: string;
        };
        Update: {
          product_id?: string;
          total_cost?: number;
          selling_price?: number;
          gross_margin_percent?: number;
          last_calculated_at?: string;
        };
      };
      stock_transactions: {
        Row: {
          id: string;
          ingredient_id: string;
          type: string;
          quantity_change: number;
          previous_stock: number;
          new_stock: number;
          reference_id: string | null;
          reason: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ingredient_id: string;
          type: string;
          quantity_change: number;
          previous_stock: number;
          new_stock: number;
          reference_id?: string | null;
          reason?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ingredient_id?: string;
          type?: string;
          quantity_change?: number;
          previous_stock?: number;
          new_stock?: number;
          reference_id?: string | null;
          reason?: string | null;
          created_by?: string;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          client_tx_id: string;
          order_number: string;
          status: string;
          type: string;
          total_amount: number;
          tax_amount: number;
          discount_amount: number;
          paid_amount: number;
          change_amount: number;
          payment_method: string;
          notes: string | null;
          created_by: string;
          created_at: string;
          synced_at: string | null;
        };
        Insert: {
          id?: string;
          client_tx_id: string;
          order_number?: string;
          status?: string;
          type: string;
          total_amount: number;
          tax_amount?: number;
          discount_amount?: number;
          paid_amount: number;
          change_amount?: number;
          payment_method: string;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          synced_at?: string | null;
        };
        Update: {
          id?: string;
          client_tx_id?: string;
          order_number?: string;
          status?: string;
          type?: string;
          total_amount?: number;
          tax_amount?: number;
          discount_amount?: number;
          paid_amount?: number;
          change_amount?: number;
          payment_method?: string;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          synced_at?: string | null;
        };
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          amount: number;
          method: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          amount: number;
          method: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          amount?: number;
          method?: string;
          status?: string;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          action: string;
          user_id: string;
          user_role: string;
          resource: string;
          resource_id: string | null;
          details: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action: string;
          user_id: string;
          user_role: string;
          resource: string;
          resource_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action?: string;
          user_id?: string;
          user_role?: string;
          resource?: string;
          resource_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      v_sales: {
        Row: {
          order_id: string;
          order_number: string;
          total_amount: number;
          created_at: string;
        };
      };
      v_order_totals: {
        Row: {
          order_id: string;
          item_count: number;
          subtotal: number;
          tax: number;
          discount: number;
          total: number;
        };
      };
      v_daily_sales: {
        Row: {
          date: string;
          total_sales: number;
          order_count: number;
          avg_ticket: number;
        };
      };
      v_monthly_sales: {
        Row: {
          month: string;
          total_sales: number;
          order_count: number;
        };
      };
      v_best_sellers: {
        Row: {
          product_id: string;
          product_name: string;
          units_sold: number;
          revenue: number;
        };
      };
      v_inventory_status: {
        Row: {
          ingredient_id: string;
          name: string;
          current_stock: number;
          minimum_stock: number;
          status: string;
        };
      };
    };
    Functions: {
      process_checkout_transaction: {
        Args: {
          p_order: Json;
        };
        Returns: Json;
      };
    };
  };
}
