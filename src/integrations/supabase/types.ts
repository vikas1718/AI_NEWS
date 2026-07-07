export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      articles: {
        Row: {
          category: Database["public"]["Enums"]["article_category"] | null;
          background_color: string | null;
          column_count: number | null;
          corrected_text: string | null;
          created_at: string;
          headline: string | null;
          headline_size: string | null;
          id: string;
          image_size: string | null;
          image_source: string | null;
          image_url: string | null;
          newspaper_id: string;
          ocr_text: string | null;
          page_number: number | null;
          position: string | null;
          priority_score: number | null;
          raw_input_type: string;
          raw_text: string | null;
          summary: string | null;
          updated_at: string;
          workflow_status: Json;
        };
        Insert: {
          category?: Database["public"]["Enums"]["article_category"] | null;
          background_color?: string | null;
          column_count?: number | null;
          corrected_text?: string | null;
          created_at?: string;
          headline?: string | null;
          headline_size?: string | null;
          id?: string;
          image_size?: string | null;
          image_source?: string | null;
          image_url?: string | null;
          newspaper_id: string;
          ocr_text?: string | null;
          page_number?: number | null;
          position?: string | null;
          priority_score?: number | null;
          raw_input_type?: string;
          raw_text?: string | null;
          summary?: string | null;
          updated_at?: string;
          workflow_status?: Json;
        };
        Update: {
          category?: Database["public"]["Enums"]["article_category"] | null;
          background_color?: string | null;
          column_count?: number | null;
          corrected_text?: string | null;
          created_at?: string;
          headline?: string | null;
          headline_size?: string | null;
          id?: string;
          image_size?: string | null;
          image_source?: string | null;
          image_url?: string | null;
          newspaper_id?: string;
          ocr_text?: string | null;
          page_number?: number | null;
          position?: string | null;
          priority_score?: number | null;
          raw_input_type?: string;
          raw_text?: string | null;
          summary?: string | null;
          updated_at?: string;
          workflow_status?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "articles_newspaper_id_fkey";
            columns: ["newspaper_id"];
            isOneToOne: false;
            referencedRelation: "newspapers";
            referencedColumns: ["id"];
          },
        ];
      };
      layouts: {
        Row: {
          generated_at: string;
          id: string;
          layout_json: Json;
          newspaper_id: string;
          version: number;
        };
        Insert: {
          generated_at?: string;
          id?: string;
          layout_json: Json;
          newspaper_id: string;
          version?: number;
        };
        Update: {
          generated_at?: string;
          id?: string;
          layout_json?: Json;
          newspaper_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "layouts_newspaper_id_fkey";
            columns: ["newspaper_id"];
            isOneToOne: false;
            referencedRelation: "newspapers";
            referencedColumns: ["id"];
          },
        ];
      };
      newspapers: {
        Row: {
          created_at: string;
          created_by: string;
          edition_date: string;
          edition_name: string;
          id: string;
          language: string;
          number_of_pages: number;
          status: Database["public"]["Enums"]["newspaper_status"];
          template: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          edition_date: string;
          edition_name: string;
          id?: string;
          language?: string;
          number_of_pages?: number;
          status?: Database["public"]["Enums"]["newspaper_status"];
          template?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          edition_date?: string;
          edition_name?: string;
          id?: string;
          language?: string;
          number_of_pages?: number;
          status?: Database["public"]["Enums"]["newspaper_status"];
          template?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      publications: {
        Row: {
          audio_url: string | null;
          epaper_url: string | null;
          facebook_post_url: string | null;
          id: string;
          instagram_card_url: string | null;
          newspaper_id: string;
          print_pdf_url: string | null;
          published_at: string;
          whatsapp_share_url: string | null;
        };
        Insert: {
          audio_url?: string | null;
          epaper_url?: string | null;
          facebook_post_url?: string | null;
          id?: string;
          instagram_card_url?: string | null;
          newspaper_id: string;
          print_pdf_url?: string | null;
          published_at?: string;
          whatsapp_share_url?: string | null;
        };
        Update: {
          audio_url?: string | null;
          epaper_url?: string | null;
          facebook_post_url?: string | null;
          id?: string;
          instagram_card_url?: string | null;
          newspaper_id?: string;
          print_pdf_url?: string | null;
          published_at?: string;
          whatsapp_share_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "publications_newspaper_id_fkey";
            columns: ["newspaper_id"];
            isOneToOne: false;
            referencedRelation: "newspapers";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          chief_editor_id: string;
          comment: string | null;
          decision: string;
          id: string;
          newspaper_id: string;
          reviewed_at: string;
        };
        Insert: {
          chief_editor_id: string;
          comment?: string | null;
          decision: string;
          id?: string;
          newspaper_id: string;
          reviewed_at?: string;
        };
        Update: {
          chief_editor_id?: string;
          comment?: string | null;
          decision?: string;
          id?: string;
          newspaper_id?: string;
          reviewed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_newspaper_id_fkey";
            columns: ["newspaper_id"];
            isOneToOne: false;
            referencedRelation: "newspapers";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "editor" | "chief_editor";
      article_category:
        | "Politics"
        | "Sports"
        | "Crime"
        | "Agriculture"
        | "Education"
        | "Cinema"
        | "Business"
        | "Other";
      newspaper_status:
        "draft" | "pending_layout" | "pending_approval" | "approved" | "rejected" | "published";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
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
    Enums: {
      app_role: ["editor", "chief_editor"],
      article_category: [
        "Politics",
        "Sports",
        "Crime",
        "Agriculture",
        "Education",
        "Cinema",
        "Business",
        "Other",
      ],
      newspaper_status: [
        "draft",
        "pending_layout",
        "pending_approval",
        "approved",
        "rejected",
        "published",
      ],
    },
  },
} as const;
