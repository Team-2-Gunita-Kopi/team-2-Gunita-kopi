export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          audit_id: number;
          created_at: string;
          details: Json | null;
          ip_address: string | null;
          resource: string;
          resource_id: string | null;
          user_agent: string | null;
          user_id: string | null;
          user_role: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          audit_id?: never;
          created_at?: string;
          details?: Json | null;
          ip_address?: string | null;
          resource: string;
          resource_id?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
          user_role?: string | null;
        };
        Update: {
          action?: string;
          audit_id?: never;
          created_at?: string;
          details?: Json | null;
          ip_address?: string | null;
          resource?: string;
          resource_id?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
          user_role?: string | null;
        };
        Relationships: [];
      };
      ingredients: {
        Row: {
          addon_quantity: number | null;
          addon_selling_price: number | null;
          current_stock: number;
          date_updated: string;
          ingredient_id: number;
          ingredient_name: string;
          is_addon: boolean;
          reorder_level: number;
          supplier_id: number | null;
          unit: string | null;
          unit_cost: number | null;
        };
        ComputedFields: never;
        Insert: {
          addon_quantity?: number | null;
          addon_selling_price?: number | null;
          current_stock?: number;
          date_updated?: string;
          ingredient_id?: never;
          ingredient_name: string;
          is_addon?: boolean;
          reorder_level?: number;
          supplier_id?: number | null;
          unit?: string | null;
          unit_cost?: number | null;
        };
        Update: {
          addon_quantity?: number | null;
          addon_selling_price?: number | null;
          current_stock?: number;
          date_updated?: string;
          ingredient_id?: never;
          ingredient_name?: string;
          is_addon?: boolean;
          reorder_level?: number;
          supplier_id?: number | null;
          unit?: string | null;
          unit_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ingredients_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["supplier_id"];
          },
        ];
      };
      login_throttle: {
        Row: {
          failures: number;
          key: string;
          locked_until: string | null;
          lockouts: number;
          updated_at: string;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          failures?: number;
          key: string;
          locked_until?: string | null;
          lockouts?: number;
          updated_at?: string;
          window_start?: string;
        };
        Update: {
          failures?: number;
          key?: string;
          locked_until?: string | null;
          lockouts?: number;
          updated_at?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      owner_login_challenges: {
        Row: {
          attempts: number;
          auth_user_id: string;
          challenge_id: number;
          created_at: string;
          expires_at: string;
          last_sent_at: string | null;
          sends: number;
          session_id: string | null;
          token_hash: string;
          verified_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          auth_user_id: string;
          challenge_id?: never;
          created_at?: string;
          expires_at?: string;
          last_sent_at?: string | null;
          sends?: number;
          session_id?: string | null;
          token_hash: string;
          verified_at?: string | null;
        };
        Update: {
          attempts?: number;
          auth_user_id?: string;
          challenge_id?: never;
          created_at?: string;
          expires_at?: string;
          last_sent_at?: string | null;
          sends?: number;
          session_id?: string | null;
          token_hash?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          client_tx_id: string;
          customization: string | null;
          ingredient_id: number | null;
          is_addon: boolean;
          order_date: string;
          order_id: number;
          order_line_id: number;
          order_type: string | null;
          product_id: number | null;
          quantity: number;
          special_instructions: string | null;
          status: string;
          subtotal: number;
          unit_price: number;
          user_id: number | null;
        };
        ComputedFields: never;
        Insert: {
          client_tx_id: string;
          customization?: string | null;
          ingredient_id?: number | null;
          is_addon?: boolean;
          order_date?: string;
          order_id: number;
          order_line_id?: never;
          order_type?: string | null;
          product_id?: number | null;
          quantity: number;
          special_instructions?: string | null;
          status?: string;
          subtotal: number;
          unit_price: number;
          user_id?: number | null;
        };
        Update: {
          client_tx_id?: string;
          customization?: string | null;
          ingredient_id?: number | null;
          is_addon?: boolean;
          order_date?: string;
          order_id?: number;
          order_line_id?: never;
          order_type?: string | null;
          product_id?: number | null;
          quantity?: number;
          special_instructions?: string | null;
          status?: string;
          subtotal?: number;
          unit_price?: number;
          user_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["ingredient_id"];
          },
          {
            foreignKeyName: "orders_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "v_inventory_status";
            referencedColumns: ["ingredient_id"];
          },
          {
            foreignKeyName: "orders_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "orders_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_best_sellers";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      payments: {
        Row: {
          amount_paid: number;
          change_amount: number;
          client_tx_id: string;
          date_time: string;
          order_id: number;
          payment_id: number;
          payment_method: string;
          received_by: number | null;
        };
        ComputedFields: never;
        Insert: {
          amount_paid: number;
          change_amount?: number;
          client_tx_id: string;
          date_time?: string;
          order_id: number;
          payment_id?: never;
          payment_method?: string;
          received_by?: number | null;
        };
        Update: {
          amount_paid?: number;
          change_amount?: number;
          client_tx_id?: string;
          date_time?: string;
          order_id?: number;
          payment_id?: never;
          payment_method?: string;
          received_by?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_received_by_fkey";
            columns: ["received_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      product_costing: {
        Row: {
          costing_id: number;
          date_updated: string;
          ingredient_cost: number;
          packaging_cost: number;
          product_id: number;
          total_cost: number | null;
        };
        ComputedFields: never;
        Insert: {
          costing_id?: never;
          date_updated?: string;
          ingredient_cost?: number;
          packaging_cost?: number;
          product_id: number;
          total_cost?: never;
        };
        Update: {
          costing_id?: never;
          date_updated?: string;
          ingredient_cost?: number;
          packaging_cost?: number;
          product_id?: number;
          total_cost?: never;
        };
        Relationships: [
          {
            foreignKeyName: "product_costing_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "product_costing_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: true;
            referencedRelation: "v_best_sellers";
            referencedColumns: ["product_id"];
          },
        ];
      };
      product_ingredients: {
        Row: {
          ingredient_id: number;
          product_id: number;
          product_ingredient_id: number;
          quantity_needed: number;
        };
        ComputedFields: never;
        Insert: {
          ingredient_id: number;
          product_id: number;
          product_ingredient_id?: never;
          quantity_needed: number;
        };
        Update: {
          ingredient_id?: number;
          product_id?: number;
          product_ingredient_id?: never;
          quantity_needed?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["ingredient_id"];
          },
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "v_inventory_status";
            referencedColumns: ["ingredient_id"];
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_best_sellers";
            referencedColumns: ["product_id"];
          },
        ];
      };
      products: {
        Row: {
          category: string | null;
          created_by: number | null;
          date_created: string;
          description: string | null;
          image: string | null;
          is_available: boolean;
          price: number;
          product_id: number;
          product_name: string;
        };
        ComputedFields: never;
        Insert: {
          category?: string | null;
          created_by?: number | null;
          date_created?: string;
          description?: string | null;
          image?: string | null;
          is_available?: boolean;
          price: number;
          product_id?: never;
          product_name: string;
        };
        Update: {
          category?: string | null;
          created_by?: number | null;
          date_created?: string;
          description?: string | null;
          image?: string | null;
          is_available?: boolean;
          price?: number;
          product_id?: never;
          product_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      stock_transactions: {
        Row: {
          date_time: string;
          ingredient_id: number;
          quantity: number;
          remaining_stock: number | null;
          remarks: string | null;
          stock_trans_id: number;
          type: string;
          user_id: number | null;
        };
        ComputedFields: never;
        Insert: {
          date_time?: string;
          ingredient_id: number;
          quantity: number;
          remaining_stock?: number | null;
          remarks?: string | null;
          stock_trans_id?: never;
          type: string;
          user_id?: number | null;
        };
        Update: {
          date_time?: string;
          ingredient_id?: number;
          quantity?: number;
          remaining_stock?: number | null;
          remarks?: string | null;
          stock_trans_id?: never;
          type?: string;
          user_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_transactions_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["ingredient_id"];
          },
          {
            foreignKeyName: "stock_transactions_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "v_inventory_status";
            referencedColumns: ["ingredient_id"];
          },
          {
            foreignKeyName: "stock_transactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      suppliers: {
        Row: {
          address: string | null;
          contact_number: string | null;
          contact_person: string | null;
          status: string;
          supplier_id: number;
          supplier_name: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          contact_number?: string | null;
          contact_person?: string | null;
          status?: string;
          supplier_id?: never;
          supplier_name: string;
        };
        Update: {
          address?: string | null;
          contact_number?: string | null;
          contact_person?: string | null;
          status?: string;
          supplier_id?: never;
          supplier_name?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          auth_user_id: string;
          date_created: string;
          email: string | null;
          full_name: string;
          role: string;
          status: string;
          user_id: number;
          username: string;
        };
        ComputedFields: never;
        Insert: {
          auth_user_id: string;
          date_created?: string;
          email?: string | null;
          full_name: string;
          role: string;
          status?: string;
          user_id?: never;
          username: string;
        };
        Update: {
          auth_user_id?: string;
          date_created?: string;
          email?: string | null;
          full_name?: string;
          role?: string;
          status?: string;
          user_id?: never;
          username?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      v_best_sellers: {
        Row: {
          product_id: number;
          product_name: string;
          revenue: number | null;
          units_sold: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      v_daily_sales: {
        Row: {
          items_sold: number | null;
          order_count: number | null;
          sale_date: string | null;
          total_sales: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      v_inventory_status: {
        Row: {
          addon_quantity: number | null;
          addon_selling_price: number | null;
          current_stock: number;
          date_updated: string;
          ingredient_id: number;
          ingredient_name: string;
          is_addon: boolean;
          reorder_level: number;
          stock_status: string | null;
          supplier_id: number | null;
          supplier_name: string | null;
          unit: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      v_monthly_sales: {
        Row: {
          order_count: number | null;
          sale_month: string | null;
          total_sales: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      v_order_totals: {
        Row: {
          item_count: number | null;
          order_date: string | null;
          order_id: number;
          order_type: string | null;
          status: string | null;
          total: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      v_sales: {
        Row: {
          ingredient_id: number | null;
          is_addon: boolean;
          order_date: string;
          order_id: number;
          order_line_id: number;
          product_id: number | null;
          quantity: number;
          subtotal: number;
        };
        ComputedFields: never;
        Insert: {
          ingredient_id?: number | null;
          is_addon?: boolean | null;
          order_date?: string | null;
          order_id?: number | null;
          order_line_id?: number | null;
          product_id?: number | null;
          quantity?: number | null;
          subtotal?: number | null;
        };
        Update: {
          ingredient_id?: number | null;
          is_addon?: boolean | null;
          order_date?: string | null;
          order_id?: number | null;
          order_line_id?: number | null;
          product_id?: number | null;
          quantity?: number | null;
          subtotal?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["ingredient_id"];
          },
          {
            foreignKeyName: "orders_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "v_inventory_status";
            referencedColumns: ["ingredient_id"];
          },
          {
            foreignKeyName: "orders_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["product_id"];
          },
          {
            foreignKeyName: "orders_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_best_sellers";
            referencedColumns: ["product_id"];
          },
        ];
      };
    };
    Functions: {
      app_role: { Args: Record<PropertyKey, never>; Returns: string };
      app_user_id: { Args: Record<PropertyKey, never>; Returns: number };
      create_barista_ingredient: {
        Args: {
          p_name: string;
          p_opening_stock: number;
          p_reorder_level: number;
          p_supplier_id: number | null;
          p_unit: string | null;
        };
        Returns: number;
      };
      barista_supplier_options: {
        Args: Record<PropertyKey, never>;
        Returns: { supplier_id: number; supplier_name: string }[];
      };
      ingredient_unit_costs: {
        Args: Record<PropertyKey, never>;
        Returns: { ingredient_id: number; unit_cost: number }[];
      };
      login_throttle_blocked: {
        Args: {
          p_account_key: string;
          p_ip_key: string;
          p_pair_key: string;
          p_trusted_key: string;
        };
        Returns: boolean;
      };
      login_throttle_fail: {
        Args: {
          p_keys: string[];
          p_limits: number[];
          p_lock_seconds: number;
          p_max_lock_seconds: number;
          p_window_seconds: number;
        };
        Returns: string;
      };
      login_throttle_success: {
        Args: { p_pair_key: string; p_trusted_key: string };
        Returns: undefined;
      };
      owner_otp_use: {
        Args: { p_kind: string; p_token_hash: string };
        Returns: { auth_user_id: string; email: string }[];
      };
      process_checkout_transaction: { Args: { p_order: Json }; Returns: Json };
      recalculate_product_costing: {
        Args: { p_product_id: number };
        Returns: undefined;
      };
      set_product_recipe: {
        Args: { p_items: Json; p_product_id: number };
        Returns: undefined;
      };
      provision_initial_owner: {
        Args: {
          p_auth_user_id: string;
          p_email: string;
          p_full_name: string;
          p_username: string;
        };
        Returns: {
          auth_user_id: string;
          date_created: string;
          email: string | null;
          full_name: string;
          role: string;
          status: string;
          user_id: number;
          username: string;
        };
        SetofOptions: {
          from: "*";
          to: "users";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
