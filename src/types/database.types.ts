export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      archivos: {
        Row: {
          bucket: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          pedido_id: string | null
          solicitud_id: string | null
          uploaded_by: string | null
          visibility: Database["public"]["Enums"]["archivo_visibility"]
        }
        Insert: {
          bucket: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          pedido_id?: string | null
          solicitud_id?: string | null
          uploaded_by?: string | null
          visibility: Database["public"]["Enums"]["archivo_visibility"]
        }
        Update: {
          bucket?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          pedido_id?: string | null
          solicitud_id?: string | null
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["archivo_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "archivos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archivos_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archivos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      pedido_comentarios: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          pedido_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          pedido_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_comentarios_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_comentarios_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_historial: {
        Row: {
          action: Database["public"]["Enums"]["pedido_historial_action"]
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          new_value: string | null
          old_value: string | null
          pedido_id: string
          summary: string
        }
        Insert: {
          action: Database["public"]["Enums"]["pedido_historial_action"]
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
          pedido_id: string
          summary: string
        }
        Update: {
          action?: Database["public"]["Enums"]["pedido_historial_action"]
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
          pedido_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_historial_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_historial_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_trabajadores: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assigned_profile_id: string
          id: string
          pedido_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assigned_profile_id: string
          id?: string
          pedido_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assigned_profile_id?: string
          id?: string
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_trabajadores_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_trabajadores_assigned_profile_id_fkey"
            columns: ["assigned_profile_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_trabajadores_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          actual_delivery_date: string | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          description: string
          estimated_delivery_date: string | null
          id: string
          order_number: string
          priority: Database["public"]["Enums"]["pedido_prioridad"]
          solicitud_id: string | null
          status: Database["public"]["Enums"]["pedido_estado"]
          title: string
          updated_at: string
        }
        Insert: {
          actual_delivery_date?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          estimated_delivery_date?: string | null
          id?: string
          order_number: string
          priority?: Database["public"]["Enums"]["pedido_prioridad"]
          solicitud_id?: string | null
          status?: Database["public"]["Enums"]["pedido_estado"]
          title: string
          updated_at?: string
        }
        Update: {
          actual_delivery_date?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          estimated_delivery_date?: string | null
          id?: string
          order_number?: string
          priority?: Database["public"]["Enums"]["pedido_prioridad"]
          solicitud_id?: string | null
          status?: Database["public"]["Enums"]["pedido_estado"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      solicitud_comentarios: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          solicitud_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          solicitud_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          solicitud_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitud_comentarios_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_comentarios_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitud_historial: {
        Row: {
          action: Database["public"]["Enums"]["solicitud_historial_action"]
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          new_value: string | null
          old_value: string | null
          solicitud_id: string
          summary: string
        }
        Insert: {
          action: Database["public"]["Enums"]["solicitud_historial_action"]
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
          solicitud_id: string
          summary: string
        }
        Update: {
          action?: Database["public"]["Enums"]["solicitud_historial_action"]
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
          solicitud_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitud_historial_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_historial_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes: {
        Row: {
          client_email: string | null
          client_name: string
          client_phone: string
          cliente_id: string | null
          converted_order_id: string | null
          created_at: string
          description: string
          desired_date: string | null
          id: string
          notes: string | null
          reviewed_by: string | null
          service_type: string
          status: Database["public"]["Enums"]["solicitud_estado"]
          updated_at: string
        }
        Insert: {
          client_email?: string | null
          client_name: string
          client_phone: string
          cliente_id?: string | null
          converted_order_id?: string | null
          created_at?: string
          description: string
          desired_date?: string | null
          id?: string
          notes?: string | null
          reviewed_by?: string | null
          service_type: string
          status?: Database["public"]["Enums"]["solicitud_estado"]
          updated_at?: string
        }
        Update: {
          client_email?: string | null
          client_name?: string
          client_phone?: string
          cliente_id?: string | null
          converted_order_id?: string | null
          created_at?: string
          description?: string
          desired_date?: string | null
          id?: string
          notes?: string | null
          reviewed_by?: string | null
          service_type?: string
          status?: Database["public"]["Enums"]["solicitud_estado"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      actualizar_estado_pedido: {
        Args: {
          p_nuevo_estado: Database["public"]["Enums"]["pedido_estado"]
          p_pedido_id: string
        }
        Returns: {
          actual_delivery_date: string | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          description: string
          estimated_delivery_date: string | null
          id: string
          order_number: string
          priority: Database["public"]["Enums"]["pedido_prioridad"]
          solicitud_id: string | null
          status: Database["public"]["Enums"]["pedido_estado"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      listar_pedido_comentarios: {
        Args: { p_pedido_id: string }
        Returns: {
          author_full_name: string
          author_role: Database["public"]["Enums"]["app_role"]
          content: string
          created_at: string
          id: string
        }[]
      }
      listar_pedido_historial: {
        Args: { p_pedido_id: string }
        Returns: {
          action: Database["public"]["Enums"]["pedido_historial_action"]
          actor_full_name: string
          actor_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          id: string
          metadata: Json
          new_value: string
          old_value: string
          summary: string
        }[]
      }
      listar_solicitud_comentarios: {
        Args: { p_solicitud_id: string }
        Returns: {
          author_full_name: string
          author_role: Database["public"]["Enums"]["app_role"]
          content: string
          created_at: string
          id: string
        }[]
      }
      listar_solicitud_historial: {
        Args: { p_solicitud_id: string }
        Returns: {
          action: Database["public"]["Enums"]["solicitud_historial_action"]
          actor_full_name: string
          actor_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          id: string
          metadata: Json
          new_value: string
          old_value: string
          summary: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "trabajador"
      archivo_visibility:
        | "cliente_solicitud"
        | "interno_pedido"
        | "avance"
        | "final_entrega"
      pedido_estado:
        | "solicitud_recibida"
        | "en_revision"
        | "cotizado"
        | "aprobado_cliente"
        | "en_diseno"
        | "en_produccion"
        | "listo_entrega"
        | "entregado"
        | "cancelado"
      pedido_historial_action:
        | "pedido_creado"
        | "estado_cambiado"
        | "trabajador_asignado"
        | "trabajador_removido"
        | "archivo_subido"
        | "nota_agregada"
        | "fecha_entrega_actualizada"
        | "pedido_entregado"
        | "pedido_cancelado"
      pedido_prioridad: "baja" | "normal" | "alta" | "urgente"
      solicitud_estado:
        | "nueva"
        | "en_revision"
        | "contactada"
        | "aprobada"
        | "rechazada"
        | "convertida"
      solicitud_historial_action:
        | "solicitud_creada"
        | "archivos_adjuntados"
        | "estado_cambiado"
        | "cliente_asociado"
        | "cliente_creado_desde_solicitud"
        | "convertida_a_pedido"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "trabajador"],
      archivo_visibility: [
        "cliente_solicitud",
        "interno_pedido",
        "avance",
        "final_entrega",
      ],
      pedido_estado: [
        "solicitud_recibida",
        "en_revision",
        "cotizado",
        "aprobado_cliente",
        "en_diseno",
        "en_produccion",
        "listo_entrega",
        "entregado",
        "cancelado",
      ],
      pedido_historial_action: [
        "pedido_creado",
        "estado_cambiado",
        "trabajador_asignado",
        "trabajador_removido",
        "archivo_subido",
        "nota_agregada",
        "fecha_entrega_actualizada",
        "pedido_entregado",
        "pedido_cancelado",
      ],
      pedido_prioridad: ["baja", "normal", "alta", "urgente"],
      solicitud_estado: [
        "nueva",
        "en_revision",
        "contactada",
        "aprobada",
        "rechazada",
        "convertida",
      ],
      solicitud_historial_action: [
        "solicitud_creada",
        "archivos_adjuntados",
        "estado_cambiado",
        "cliente_asociado",
        "cliente_creado_desde_solicitud",
        "convertida_a_pedido",
      ],
    },
  },
} as const

