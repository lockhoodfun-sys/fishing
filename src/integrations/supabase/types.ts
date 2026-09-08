export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bait_tiers: {
        Row: {
          id: string
          luck_percent: number
          name: string
          price_coins: number
          rarity_multiplier: Json
          sort_order: number
        }
        Insert: {
          id: string
          luck_percent?: number
          name: string
          price_coins?: number
          rarity_multiplier?: Json
          sort_order?: number
        }
        Update: {
          id?: string
          luck_percent?: number
          name?: string
          price_coins?: number
          rarity_multiplier?: Json
          sort_order?: number
        }
        Relationships: []
      }
      boat_tiers: {
        Row: {
          id: string
          name: string
          price_coins: number
          sort_order: number
          speed_percent: number
        }
        Insert: {
          id: string
          name: string
          price_coins?: number
          sort_order?: number
          speed_percent?: number
        }
        Update: {
          id?: string
          name?: string
          price_coins?: number
          sort_order?: number
          speed_percent?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          message: string
          username: string
          wallet_address: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          message: string
          username: string
          wallet_address: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          message?: string
          username?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      fish_inventory_items: {
        Row: {
          caught_at: string
          id: string
          mutation_key: string
          species_id: string
          wallet_address: string
          weight_kg: number
        }
        Insert: {
          caught_at?: string
          id?: string
          mutation_key?: string
          species_id: string
          wallet_address: string
          weight_kg: number
        }
        Update: {
          caught_at?: string
          id?: string
          mutation_key?: string
          species_id?: string
          wallet_address?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "fish_inventory_items_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      fish_species: {
        Row: {
          base_price_per_kg: number
          color: string
          id: string
          is_monster: boolean
          max_weight_kg: number
          min_weight_kg: number
          name: string
          rarity: string | null
        }
        Insert: {
          base_price_per_kg?: number
          color?: string
          id: string
          is_monster?: boolean
          max_weight_kg?: number
          min_weight_kg?: number
          name: string
          rarity?: string | null
        }
        Update: {
          base_price_per_kg?: number
          color?: string
          id?: string
          is_monster?: boolean
          max_weight_kg?: number
          min_weight_kg?: number
          name?: string
          rarity?: string | null
        }
        Relationships: []
      }
      fish_hold_tiers: {
        Row: {
          generation_cap_gold: number | null
          id: string
          min_usd_value: number
          sort_order: number
          wd_max: number | null
          wd_min: number | null
          wd_per_day: number
        }
        Insert: {
          generation_cap_gold?: number | null
          id: string
          min_usd_value: number
          sort_order?: number
          wd_max?: number | null
          wd_min?: number | null
          wd_per_day?: number
        }
        Update: {
          generation_cap_gold?: number | null
          id?: string
          min_usd_value?: number
          sort_order?: number
          wd_max?: number | null
          wd_min?: number | null
          wd_per_day?: number
        }
        Relationships: []
      }
      game_config: {
        Row: {
          key: string
          value: number
        }
        Insert: {
          key: string
          value?: number
        }
        Update: {
          key?: string
          value?: number
        }
        Relationships: []
      }
      gold_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          metadata: Json
          reason: string
          wallet_address: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          wallet_address: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "gold_ledger_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      mutations: {
        Row: {
          drop_weight: number
          key: string
          label: string
          multiplier: number
        }
        Insert: {
          drop_weight?: number
          key: string
          label: string
          multiplier?: number
        }
        Update: {
          drop_weight?: number
          key?: string
          label?: string
          multiplier?: number
        }
        Relationships: []
      }
      npc_reward_claims: {
        Row: {
          base_claims_count: number
          bonus_claimed: boolean
          event_id: string
          id: string
          total_gold_earned: number
          updated_at: string
          wallet_address: string
        }
        Insert: {
          base_claims_count?: number
          bonus_claimed?: boolean
          event_id: string
          id?: string
          total_gold_earned?: number
          updated_at?: string
          wallet_address: string
        }
        Update: {
          base_claims_count?: number
          bonus_claimed?: boolean
          event_id?: string
          id?: string
          total_gold_earned?: number
          updated_at?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "npc_reward_claims_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "npc_reward_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "npc_reward_claims_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      npc_reward_config: {
        Row: {
          key: string
          value: number
        }
        Insert: {
          key: string
          value: number
        }
        Update: {
          key?: string
          value?: number
        }
        Relationships: []
      }
      npc_reward_events: {
        Row: {
          base_requirement: Json
          bonus_requirement: Json
          created_at: string
          event_date: string
          expire_at: string
          id: string
          spawn_at: string
        }
        Insert: {
          base_requirement: Json
          bonus_requirement: Json
          created_at?: string
          event_date: string
          expire_at: string
          id?: string
          spawn_at: string
        }
        Update: {
          base_requirement?: Json
          bonus_requirement?: Json
          created_at?: string
          event_date?: string
          expire_at?: string
          id?: string
          spawn_at?: string
        }
        Relationships: []
      }
      player_baits: {
        Row: {
          bait_id: string
          equipped: boolean
          purchased_at: string
          wallet_address: string
        }
        Insert: {
          bait_id: string
          equipped?: boolean
          purchased_at?: string
          wallet_address: string
        }
        Update: {
          bait_id?: string
          equipped?: boolean
          purchased_at?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_baits_bait_id_fkey"
            columns: ["bait_id"]
            isOneToOne: false
            referencedRelation: "bait_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_baits_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      player_boats: {
        Row: {
          boat_id: string
          equipped: boolean
          purchased_at: string
          wallet_address: string
        }
        Insert: {
          boat_id: string
          equipped?: boolean
          purchased_at?: string
          wallet_address: string
        }
        Update: {
          boat_id?: string
          equipped?: boolean
          purchased_at?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_boats_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boat_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_boats_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      player_quest_progress: {
        Row: {
          current_quest_order: number
          progress_value: number
          status: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          current_quest_order?: number
          progress_value?: number
          status?: string
          updated_at?: string
          wallet_address: string
        }
        Update: {
          current_quest_order?: number
          progress_value?: number
          status?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_quest_progress_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      player_rods: {
        Row: {
          equipped: boolean
          purchased_at: string
          rod_id: string
          wallet_address: string
        }
        Insert: {
          equipped?: boolean
          purchased_at?: string
          rod_id: string
          wallet_address: string
        }
        Update: {
          equipped?: boolean
          purchased_at?: string
          rod_id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_rods_rod_id_fkey"
            columns: ["rod_id"]
            isOneToOne: false
            referencedRelation: "rod_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_rods_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          coins: number
          created_at: string
          display_name: string
          fish_common: number
          fish_epic: number
          fish_legendary: number
          fish_mythic: number
          fish_rare: number
          gold: number
          level: number
          updated_at: string
          username: string
          wallet_address: string
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          coins?: number
          created_at?: string
          display_name?: string
          fish_common?: number
          fish_epic?: number
          fish_legendary?: number
          fish_mythic?: number
          fish_rare?: number
          gold?: number
          level?: number
          updated_at?: string
          username: string
          wallet_address: string
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          coins?: number
          created_at?: string
          display_name?: string
          fish_common?: number
          fish_epic?: number
          fish_legendary?: number
          fish_mythic?: number
          fish_rare?: number
          gold?: number
          level?: number
          updated_at?: string
          username?: string
          wallet_address?: string
          xp?: number
        }
        Relationships: []
      }
      quest_definitions: {
        Row: {
          description: string
          id: string
          order_index: number
          requirement: Json
          reward_coins: number
          title: string
        }
        Insert: {
          description: string
          id: string
          order_index: number
          requirement: Json
          reward_coins: number
          title: string
        }
        Update: {
          description?: string
          id?: string
          order_index?: number
          requirement?: Json
          reward_coins?: number
          title?: string
        }
        Relationships: []
      }
      rarity_base_weights: {
        Row: {
          base_weight: number
          rarity: string
        }
        Insert: {
          base_weight?: number
          rarity: string
        }
        Update: {
          base_weight?: number
          rarity?: string
        }
        Relationships: []
      }
      rod_tiers: {
        Row: {
          id: string
          luck_percent: number
          max_catch_weight_kg: number
          name: string
          price_coins: number
          sort_order: number
          speed_percent: number
        }
        Insert: {
          id: string
          luck_percent?: number
          max_catch_weight_kg?: number
          name: string
          price_coins?: number
          sort_order?: number
          speed_percent?: number
        }
        Update: {
          id?: string
          luck_percent?: number
          max_catch_weight_kg?: number
          name?: string
          price_coins?: number
          sort_order?: number
          speed_percent?: number
        }
        Relationships: []
      }
      weather_cycle_config: {
        Row: {
          change_interval_seconds: number
          id: string
          weights: Json
        }
        Insert: {
          change_interval_seconds?: number
          id: string
          weights?: Json
        }
        Update: {
          change_interval_seconds?: number
          id?: string
          weights?: Json
        }
        Relationships: []
      }
      weather_effects: {
        Row: {
          bite_window_seconds: number
          rarity_multiplier: Json
          weather_kind: string
        }
        Insert: {
          bite_window_seconds?: number
          rarity_multiplier?: Json
          weather_kind: string
        }
        Update: {
          bite_window_seconds?: number
          rarity_multiplier?: Json
          weather_kind?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          gold_amount: number
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          status: string
          tx_hash: string | null
          wallet_address: string
        }
        Insert: {
          gold_amount: number
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          tx_hash?: string | null
          wallet_address: string
        }
        Update: {
          gold_amount?: number
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          tx_hash?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buy_bait: {
        Args: { _bait_id: string; _wallet: string }
        Returns: {
          avatar_url: string | null
          coins: number
          created_at: string
          display_name: string
          fish_common: number
          fish_epic: number
          fish_legendary: number
          fish_mythic: number
          fish_rare: number
          level: number
          updated_at: string
          username: string
          wallet_address: string
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      buy_boat: {
        Args: { _boat_id: string; _wallet: string }
        Returns: {
          avatar_url: string | null
          coins: number
          created_at: string
          display_name: string
          fish_common: number
          fish_epic: number
          fish_legendary: number
          fish_mythic: number
          fish_rare: number
          level: number
          updated_at: string
          username: string
          wallet_address: string
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      buy_rod: {
        Args: { _rod_id: string; _wallet: string }
        Returns: {
          avatar_url: string | null
          coins: number
          created_at: string
          display_name: string
          fish_common: number
          fish_epic: number
          fish_legendary: number
          fish_mythic: number
          fish_rare: number
          level: number
          updated_at: string
          username: string
          wallet_address: string
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_starter_gear: { Args: { _wallet: string }; Returns: undefined }
      equip_bait: {
        Args: { _bait_id: string; _wallet: string }
        Returns: undefined
      }
      equip_boat: {
        Args: { _boat_id: string; _wallet: string }
        Returns: undefined
      }
      equip_rod: {
        Args: { _rod_id: string; _wallet: string }
        Returns: undefined
      }
      get_leaderboard: {
        Args: { _limit: number; _sort_by: string }
        Returns: {
          avatar_url: string | null
          coins: number
          display_name: string
          level: number
          rank: number
          total_fish: number
          username: string
          wallet_address: string
          xp: number
        }[]
      }
      get_my_leaderboard_rank: {
        Args: { _sort_by: string; _wallet: string }
        Returns: {
          avatar_url: string | null
          coins: number
          display_name: string
          level: number
          rank: number
          total_fish: number
          username: string
          wallet_address: string
          xp: number
        }[]
      }
      get_player_baits: {
        Args: { _wallet: string }
        Returns: {
          bait_id: string
          equipped: boolean
          luck_percent: number
          name: string
          price_coins: number
          purchased_at: string
        }[]
      }
      get_player_boats: {
        Args: { _wallet: string }
        Returns: {
          boat_id: string
          equipped: boolean
          name: string
          price_coins: number
          purchased_at: string
          speed_percent: number
        }[]
      }
      get_player_rods: {
        Args: { _wallet: string }
        Returns: {
          equipped: boolean
          luck_percent: number
          max_catch_weight_kg: number
          name: string
          price_coins: number
          purchased_at: string
          rod_id: string
          speed_percent: number
        }[]
      }
      level_for_xp: { Args: { _xp: number }; Returns: number }
      record_catch: {
        Args: {
          _wallet: string
          _weather_kind?: string
        }
        Returns: {
          out_species_id: string
          out_species_name: string
          out_color: string
          out_rarity: string
          out_weight_kg: number
          out_mutation_key: string
          out_mutation_label: string
          out_is_monster: boolean
          out_xp_gained: number
          out_profile: {
            avatar_url: string | null
            coins: number
            created_at: string
            display_name: string
            fish_common: number
            fish_epic: number
            fish_legendary: number
            fish_mythic: number
            fish_rare: number
            level: number
            updated_at: string
            username: string
            wallet_address: string
            xp: number
          }
        }
        SetofOptions: {
          from: "*"
          to: "record_catch"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sell_fish: {
        Args: {
          _item_id: string
          _sell_all: boolean
          _species_id: string
          _wallet: string
        }
        Returns: {
          avatar_url: string | null
          coins: number
          created_at: string
          display_name: string
          fish_common: number
          fish_epic: number
          fish_legendary: number
          fish_mythic: number
          fish_rare: number
          level: number
          updated_at: string
          username: string
          wallet_address: string
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_chat_message: {
        Args: { _message: string; _wallet: string }
        Returns: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          message: string
          username: string
          wallet_address: string
        }
      }
      xp_for_rarity: { Args: { _rarity: string }; Returns: number }
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

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const