/**
 * أنواع قاعدة البيانات — مُولَّدة آليًا. لا تُعدَّل يدويًا.
 *
 * إعادة التوليد:
 *   npm run db:types
 *   (أو: supabase gen types typescript --project-id kaanfupnhyleeuiqzvvq > lib/supabase/types.ts)
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bins: {
        Row: {
          area_ar: string | null
          created_at: string
          distance_km: number | null
          fill_pct: number
          id: string
          is_active: boolean
          name_ar: string
          open_until: string | null
          sort_order: number
        }
        Insert: {
          area_ar?: string | null
          created_at?: string
          distance_km?: number | null
          fill_pct?: number
          id?: string
          is_active?: boolean
          name_ar: string
          open_until?: string | null
          sort_order?: number
        }
        Update: {
          area_ar?: string | null
          created_at?: string
          distance_km?: number | null
          fill_pct?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          open_until?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      device_categories: {
        Row: {
          hazard_bonus: number
          hazard_label_ar: string | null
          id: string
          name_ar: string
          points_per_kg: number
          sort_order: number
        }
        Insert: {
          hazard_bonus?: number
          hazard_label_ar?: string | null
          id: string
          name_ar: string
          points_per_kg: number
          sort_order?: number
        }
        Update: {
          hazard_bonus?: number
          hazard_label_ar?: string | null
          id?: string
          name_ar?: string
          points_per_kg?: number
          sort_order?: number
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          id: number
          last_error: string | null
          payload: Json
          processed_at: string | null
          status: string
          user_id: string | null
          wallet_key: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: string
          id?: never
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
          user_id?: string | null
          wallet_key?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          id?: never
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
          user_id?: string | null
          wallet_key?: string | null
        }
        Relationships: []
      }
      points_ledger: {
        Row: {
          created_at: string
          delta: number
          id: number
          reason_ar: string
          redemption_id: string | null
          reward_id: string | null
          submission_id: string | null
          user_id: string | null
          wallet_key: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: never
          reason_ar: string
          redemption_id?: string | null
          reward_id?: string | null
          submission_id?: string | null
          user_id?: string | null
          wallet_key: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: never
          reason_ar?: string
          redemption_id?: string | null
          reward_id?: string | null
          submission_id?: string | null
          user_id?: string | null
          wallet_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "v_recent_activity"
            referencedColumns: ["id"]
          },
        ]
      }
      points_thresholds: {
        Row: {
          is_active: boolean
          label_ar: string
          threshold: number
        }
        Insert: {
          is_active?: boolean
          label_ar: string
          threshold: number
        }
        Update: {
          is_active?: boolean
          label_ar?: string
          threshold?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_guest: boolean
          points: number
          updated_at: string
          wallet_key: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          is_guest?: boolean
          points?: number
          updated_at?: string
          wallet_key: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_guest?: boolean
          points?: number
          updated_at?: string
          wallet_key?: string
        }
        Relationships: []
      }
      redemptions: {
        Row: {
          cost_points: number
          created_at: string
          id: string
          reward_id: string
          user_id: string | null
          voucher_code: string
          wallet_key: string
        }
        Insert: {
          cost_points: number
          created_at?: string
          id?: string
          reward_id: string
          user_id?: string | null
          voucher_code: string
          wallet_key: string
        }
        Update: {
          cost_points?: number
          created_at?: string
          id?: string
          reward_id?: string
          user_id?: string | null
          voucher_code?: string
          wallet_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          cost_points: number
          detail_ar: string | null
          id: string
          is_active: boolean
          name_ar: string
          sort_order: number
          stock: number | null
          worth_kwd: number | null
        }
        Insert: {
          cost_points: number
          detail_ar?: string | null
          id: string
          is_active?: boolean
          name_ar: string
          sort_order?: number
          stock?: number | null
          worth_kwd?: number | null
        }
        Update: {
          cost_points?: number
          detail_ar?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          sort_order?: number
          stock?: number | null
          worth_kwd?: number | null
        }
        Relationships: []
      }
      submissions: {
        Row: {
          actual_weight_kg: number | null
          bin_id: string | null
          category_id: string
          confidence: number | null
          created_at: string
          deposit_code: string | null
          device_label: string | null
          display_name: string
          est_weight_kg: number
          hazards: Json
          id: string
          is_seed: boolean
          points: number
          recoverables: Json
          status: string
          user_id: string | null
          wallet_key: string
        }
        Insert: {
          actual_weight_kg?: number | null
          bin_id?: string | null
          category_id: string
          confidence?: number | null
          created_at?: string
          deposit_code?: string | null
          device_label?: string | null
          display_name?: string
          est_weight_kg: number
          hazards?: Json
          id?: string
          is_seed?: boolean
          points?: number
          recoverables?: Json
          status?: string
          user_id?: string | null
          wallet_key: string
        }
        Update: {
          actual_weight_kg?: number | null
          bin_id?: string | null
          category_id?: string
          confidence?: number | null
          created_at?: string
          deposit_code?: string | null
          device_label?: string | null
          display_name?: string
          est_weight_kg?: number
          hazards?: Json
          id?: string
          is_seed?: boolean
          points?: number
          recoverables?: Json
          status?: string
          user_id?: string | null
          wallet_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "device_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_impact_stats: {
        Row: {
          bins_count: number | null
          devices_count: number | null
          kwd_value: number | null
          tons_diverted: number | null
        }
        Relationships: []
      }
      v_recent_activity: {
        Row: {
          created_at: string | null
          device_label: string | null
          display_name: string | null
          id: string | null
          is_seed: boolean | null
          points: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calc_points: {
        Args: {
          p_category_id: string
          p_has_hazard?: boolean
          p_weight_kg: number
        }
        Returns: number
      }
      claim_guest_wallet: { Args: { p_wallet_key: string }; Returns: Json }
      confirm_deposit: {
        Args: { p_deposit_code: string; p_submission_id: string }
        Returns: Json
      }
      dispatch_pending_events: { Args: { p_limit?: number }; Returns: number }
      get_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          display_name: string
          points: number
          rank: number
        }[]
      }
      get_my_summary: { Args: never; Returns: Json }
      mark_event_processed: {
        Args: { p_error?: string; p_event_id: number; p_ok: boolean }
        Returns: undefined
      }
      recalculate_points: { Args: { p_user_id?: string }; Returns: number }
      redeem_reward: {
        Args: { p_reward_id: string; p_wallet_key: string }
        Returns: Json
      }
      rotate_webhook_token: { Args: never; Returns: string }
      verify_deposit: {
        Args: { p_actual_weight_kg: number; p_submission_id: string }
        Returns: number
      }
      verify_webhook_token: { Args: { p_token: string }; Returns: boolean }
      wallet_balance: { Args: { p_wallet_key: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
