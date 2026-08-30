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
      ad_copy_templates: {
        Row: {
          category: string
          created_at: string
          headlines: string[]
          id: string
          name: string
          primary_texts: string[]
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          headlines?: string[]
          id?: string
          name: string
          primary_texts?: string[]
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          headlines?: string[]
          id?: string
          name?: string
          primary_texts?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      ad_insights: {
        Row: {
          ad_account_id: string
          adset_id: string | null
          campaign_id: string | null
          clicks: number | null
          conversion_value: number | null
          conversions: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          date_preset: string | null
          date_start: string
          date_stop: string
          fetched_at: string
          id: string
          impressions: number | null
          level: string
          object_id: string
          object_name: string | null
          reach: number | null
          spend: number | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          adset_id?: string | null
          campaign_id?: string | null
          clicks?: number | null
          conversion_value?: number | null
          conversions?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date_preset?: string | null
          date_start: string
          date_stop: string
          fetched_at?: string
          id?: string
          impressions?: number | null
          level?: string
          object_id: string
          object_name?: string | null
          reach?: number | null
          spend?: number | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          adset_id?: string | null
          campaign_id?: string | null
          clicks?: number | null
          conversion_value?: number | null
          conversions?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date_preset?: string | null
          date_start?: string
          date_stop?: string
          fetched_at?: string
          id?: string
          impressions?: number | null
          level?: string
          object_id?: string
          object_name?: string | null
          reach?: number | null
          spend?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ad_landing_pages: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          label: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      ad_launch_items: {
        Row: {
          ad_name: string | null
          ad_set_id: string | null
          ad_set_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          created_at: string
          cta: string | null
          error_message: string | null
          headline: string | null
          id: string
          identity_type: string
          landing_url: string | null
          launch_id: string
          meta_ad_id: string | null
          meta_status: string | null
          primary_text: string | null
          updated_at: string
          video_id: string
        }
        Insert: {
          ad_name?: string | null
          ad_set_id?: string | null
          ad_set_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          cta?: string | null
          error_message?: string | null
          headline?: string | null
          id?: string
          identity_type?: string
          landing_url?: string | null
          launch_id: string
          meta_ad_id?: string | null
          meta_status?: string | null
          primary_text?: string | null
          updated_at?: string
          video_id: string
        }
        Update: {
          ad_name?: string | null
          ad_set_id?: string | null
          ad_set_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          cta?: string | null
          error_message?: string | null
          headline?: string | null
          id?: string
          identity_type?: string
          landing_url?: string | null
          launch_id?: string
          meta_ad_id?: string | null
          meta_status?: string | null
          primary_text?: string | null
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_launch_items_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "ad_launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_launch_items_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_launches: {
        Row: {
          ad_preferences: Json
          ad_set_config: Json
          ads_created: number
          campaign_config: Json
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          launched_by: string | null
          status: string
          total_ads: number
          updated_at: string
        }
        Insert: {
          ad_preferences?: Json
          ad_set_config?: Json
          ads_created?: number
          campaign_config?: Json
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          launched_by?: string | null
          status?: string
          total_ads?: number
          updated_at?: string
        }
        Update: {
          ad_preferences?: Json
          ad_set_config?: Json
          ads_created?: number
          campaign_config?: Json
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          launched_by?: string | null
          status?: string
          total_ads?: number
          updated_at?: string
        }
        Relationships: []
      }
      ad_presets: {
        Row: {
          created_at: string
          default_cta: string | null
          id: string
          naming_template: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          default_cta?: string | null
          id?: string
          naming_template?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          default_cta?: string | null
          id?: string
          naming_template?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      agreement_acceptances: {
        Row: {
          accepted_at: string
          agreement_id: string
          app_version: string | null
          creator_id: string
          id: string
          ip: string | null
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          agreement_id: string
          app_version?: string | null
          creator_id: string
          id?: string
          ip?: string | null
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          agreement_id?: string
          app_version?: string | null
          creator_id?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_acceptances_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_acceptances_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_targets: {
        Row: {
          agreement_id: string
          cohort_id: string | null
          created_at: string
          creator_id: string | null
          id: string
        }
        Insert: {
          agreement_id: string
          cohort_id?: string | null
          created_at?: string
          creator_id?: string | null
          id?: string
        }
        Update: {
          agreement_id?: string
          cohort_id?: string | null
          created_at?: string
          creator_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agreement_targets_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_targets_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "creator_cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_targets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agreements: {
        Row: {
          accept_deadline: string | null
          audience: string
          body: string
          created_at: string
          created_by: string | null
          effective_at: string
          id: string
          is_active: boolean
          required: boolean
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          accept_deadline?: string | null
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          effective_at?: string
          id?: string
          is_active?: boolean
          required?: boolean
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          accept_deadline?: string | null
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          effective_at?: string
          id?: string
          is_active?: boolean
          required?: boolean
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      ai_agent_runs: {
        Row: {
          agent_id: string
          error: string | null
          finished_at: string | null
          id: string
          output: string | null
          started_at: string
          status: string
          summary: string | null
        }
        Insert: {
          agent_id: string
          error?: string | null
          finished_at?: string | null
          id?: string
          output?: string | null
          started_at?: string
          status?: string
          summary?: string | null
        }
        Update: {
          agent_id?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          output?: string | null
          started_at?: string
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          instructions: string
          last_run_at: string | null
          last_status: string | null
          name: string
          notify_email: string | null
          schedule: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          instructions: string
          last_run_at?: string | null
          last_status?: string | null
          name: string
          notify_email?: string | null
          schedule?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          instructions?: string
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          notify_email?: string | null
          schedule?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          scope: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          scope?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          scope?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_activity: Json | null
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_activity?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_activity?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_workbook_docs: {
        Row: {
          content: string
          created_at: string
          doc_type: string
          id: string
          is_shared: boolean
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          doc_type?: string
          id?: string
          is_shared?: boolean
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          doc_type?: string
          id?: string
          is_shared?: boolean
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bounties: {
        Row: {
          cohort_id: string | null
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          milestone_type: string
          milestone_value: number
          reward_amount: number
          status: Database["public"]["Enums"]["bounty_status"]
          time_limit_days: number | null
          title: string
          updated_at: string
          xp_reward: number | null
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          milestone_type: string
          milestone_value: number
          reward_amount: number
          status?: Database["public"]["Enums"]["bounty_status"]
          time_limit_days?: number | null
          title: string
          updated_at?: string
          xp_reward?: number | null
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          milestone_type?: string
          milestone_value?: number
          reward_amount?: number
          status?: Database["public"]["Enums"]["bounty_status"]
          time_limit_days?: number | null
          title?: string
          updated_at?: string
          xp_reward?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bounties_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "creator_cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          commission_rate: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          social_links: Json | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          commission_rate?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          social_links?: Json | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          commission_rate?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          social_links?: Json | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          brand_id: string
          brief: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          brief?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          brief?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_upload_schedules: {
        Row: {
          cohort_id: string
          created_at: string
          effective_from: string
          id: string
          lock_day_of_week: number | null
          max_misses_per_month: number
          required_weekdays: number[]
          updated_at: string
          videos_per_day: number
        }
        Insert: {
          cohort_id: string
          created_at?: string
          effective_from?: string
          id?: string
          lock_day_of_week?: number | null
          max_misses_per_month?: number
          required_weekdays?: number[]
          updated_at?: string
          videos_per_day?: number
        }
        Update: {
          cohort_id?: string
          created_at?: string
          effective_from?: string
          id?: string
          lock_day_of_week?: number | null
          max_misses_per_month?: number
          required_weekdays?: number[]
          updated_at?: string
          videos_per_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "cohort_upload_schedules_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "creator_cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      consistency_milestones: {
        Row: {
          day_number: number
          display_cash_value: number
          id: string
          is_active: boolean
          xp_reward: number
        }
        Insert: {
          day_number: number
          display_cash_value: number
          id?: string
          is_active?: boolean
          xp_reward: number
        }
        Update: {
          day_number?: number
          display_cash_value?: number
          id?: string
          is_active?: boolean
          xp_reward?: number
        }
        Relationships: []
      }
      creative_briefs: {
        Row: {
          brand_id: string | null
          campaign_id: string | null
          created_at: string
          deadline: string | null
          description: string | null
          donts: string[] | null
          dos: string[] | null
          example_video_urls: string[] | null
          guidelines: string | null
          id: string
          is_active: boolean | null
          mood_board_urls: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          campaign_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          donts?: string[] | null
          dos?: string[] | null
          example_video_urls?: string[] | null
          guidelines?: string | null
          id?: string
          is_active?: boolean | null
          mood_board_urls?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          campaign_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          donts?: string[] | null
          dos?: string[] | null
          example_video_urls?: string[] | null
          guidelines?: string | null
          id?: string
          is_active?: boolean | null
          mood_board_urls?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_briefs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_briefs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_references: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          notes: string | null
          source_url: string | null
          tags: string[] | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          source_url?: string | null
          tags?: string[] | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          source_url?: string | null
          tags?: string[] | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      creator_bounties: {
        Row: {
          bounty_id: string
          created_at: string
          creator_id: string
          id: string
          payout_approved: boolean | null
          qualified: boolean | null
          qualified_at: string | null
          video_id: string | null
        }
        Insert: {
          bounty_id: string
          created_at?: string
          creator_id: string
          id?: string
          payout_approved?: boolean | null
          qualified?: boolean | null
          qualified_at?: string | null
          video_id?: string | null
        }
        Update: {
          bounty_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          payout_approved?: boolean | null
          qualified?: boolean | null
          qualified_at?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_bounties_bounty_id_fkey"
            columns: ["bounty_id"]
            isOneToOne: false
            referencedRelation: "bounties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_bounties_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_bounties_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_brands: {
        Row: {
          brand_id: string
          creator_id: string
          id: string
          joined_at: string
          status: string
        }
        Insert: {
          brand_id: string
          creator_id: string
          id?: string
          joined_at?: string
          status?: string
        }
        Update: {
          brand_id?: string
          creator_id?: string
          id?: string
          joined_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_challenge_completions: {
        Row: {
          bonus_earned: number | null
          challenge_id: string
          completed_at: string
          creator_id: string
          id: string
          xp_earned: number
        }
        Insert: {
          bonus_earned?: number | null
          challenge_id: string
          completed_at?: string
          creator_id: string
          id?: string
          xp_earned: number
        }
        Update: {
          bonus_earned?: number | null
          challenge_id?: string
          completed_at?: string
          creator_id?: string
          id?: string
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "creator_challenge_completions_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "weekly_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_challenge_completions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_cohort_members: {
        Row: {
          added_at: string
          cohort_id: string
          creator_id: string
          id: string
        }
        Insert: {
          added_at?: string
          cohort_id: string
          creator_id: string
          id?: string
        }
        Update: {
          added_at?: string
          cohort_id?: string
          creator_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_cohort_members_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "creator_cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_cohort_members_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_cohorts: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_consistency_tracking: {
        Row: {
          cohort_multiplier_applied: boolean
          created_at: string
          creator_id: string
          id: string
          is_consistent: boolean
          multiplied_xp_earned: number
          streak_day: number
          tracking_date: string
          upload_count: number
          xp_earned: number
        }
        Insert: {
          cohort_multiplier_applied?: boolean
          created_at?: string
          creator_id: string
          id?: string
          is_consistent?: boolean
          multiplied_xp_earned?: number
          streak_day?: number
          tracking_date: string
          upload_count?: number
          xp_earned?: number
        }
        Update: {
          cohort_multiplier_applied?: boolean
          created_at?: string
          creator_id?: string
          id?: string
          is_consistent?: boolean
          multiplied_xp_earned?: number
          streak_day?: number
          tracking_date?: string
          upload_count?: number
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "creator_consistency_tracking_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_daily_upload_status: {
        Row: {
          approved_count: number
          creator_id: string
          date: string
          id: string
          is_required_day: boolean
          locked_at: string | null
          required_count: number
          status: string
          updated_at: string
        }
        Insert: {
          approved_count?: number
          creator_id: string
          date: string
          id?: string
          is_required_day?: boolean
          locked_at?: string | null
          required_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          approved_count?: number
          creator_id?: string
          date?: string
          id?: string
          is_required_day?: boolean
          locked_at?: string | null
          required_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_daily_upload_status_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_gamification: {
        Row: {
          created_at: string
          creator_id: string
          current_level: number
          current_streak: number
          id: string
          last_activity_date: string | null
          longest_streak: number
          redeemable_xp: number
          streak_type: string
          total_xp: number
          updated_at: string
          weekly_challenge_completed: boolean
          weekly_challenge_id: string | null
          weekly_challenge_progress: number
        }
        Insert: {
          created_at?: string
          creator_id: string
          current_level?: number
          current_streak?: number
          id?: string
          last_activity_date?: string | null
          longest_streak?: number
          redeemable_xp?: number
          streak_type?: string
          total_xp?: number
          updated_at?: string
          weekly_challenge_completed?: boolean
          weekly_challenge_id?: string | null
          weekly_challenge_progress?: number
        }
        Update: {
          created_at?: string
          creator_id?: string
          current_level?: number
          current_streak?: number
          id?: string
          last_activity_date?: string | null
          longest_streak?: number
          redeemable_xp?: number
          streak_type?: string
          total_xp?: number
          updated_at?: string
          weekly_challenge_completed?: boolean
          weekly_challenge_id?: string | null
          weekly_challenge_progress?: number
        }
        Relationships: [
          {
            foreignKeyName: "creator_gamification_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_monthly_eligibility: {
        Row: {
          creator_id: string
          id: string
          locked_at: string | null
          met_days: number
          missed_days: number
          month: string
          required_days: number
          status: string
          updated_at: string
        }
        Insert: {
          creator_id: string
          id?: string
          locked_at?: string | null
          met_days?: number
          missed_days?: number
          month: string
          required_days?: number
          status?: string
          updated_at?: string
        }
        Update: {
          creator_id?: string
          id?: string
          locked_at?: string | null
          met_days?: number
          missed_days?: number
          month?: string
          required_days?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_monthly_eligibility_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_video_counters: {
        Row: {
          counter_date: string
          created_at: string | null
          id: string
          next_sequence: number
          updated_at: string | null
        }
        Insert: {
          counter_date: string
          created_at?: string | null
          id?: string
          next_sequence?: number
          updated_at?: string | null
        }
        Update: {
          counter_date?: string
          created_at?: string | null
          id?: string
          next_sequence?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          created_at: string
          id: string
          participant1_id: string
          participant2_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant1_id: string
          participant2_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          participant1_id?: string
          participant2_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_chat_members: {
        Row: {
          chat_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_chat_members_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_chats: {
        Row: {
          chat_type: string
          created_at: string
          created_by: string | null
          description: string | null
          icon_url: string | null
          id: string
          name: string
        }
        Insert: {
          chat_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          name: string
        }
        Update: {
          chat_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          brand_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          used_at: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_reactions: {
        Row: {
          created_at: string
          id: string
          reaction: string
          reactor_id: string
          target_creator_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction?: string
          reactor_id: string
          target_creator_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction?: string
          reactor_id?: string
          target_creator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_reactions_reactor_id_fkey"
            columns: ["reactor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_reactions_target_creator_id_fkey"
            columns: ["target_creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_assignments: {
        Row: {
          admin_notes: string | null
          assigned_by: string
          completed_at: string | null
          created_at: string
          id: string
          mentor_id: string
          mentor_notes: string | null
          status: string
          task_contacted: boolean
          task_example_shared: boolean
          task_feedback_sent: boolean
          updated_at: string
          video_id: string
        }
        Insert: {
          admin_notes?: string | null
          assigned_by: string
          completed_at?: string | null
          created_at?: string
          id?: string
          mentor_id: string
          mentor_notes?: string | null
          status?: string
          task_contacted?: boolean
          task_example_shared?: boolean
          task_feedback_sent?: boolean
          updated_at?: string
          video_id: string
        }
        Update: {
          admin_notes?: string | null
          assigned_by?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          mentor_id?: string
          mentor_notes?: string | null
          status?: string
          task_contacted?: boolean
          task_example_shared?: boolean
          task_feedback_sent?: boolean
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_assignments_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_creator_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          creator_id: string
          id: string
          mentor_id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          creator_id: string
          id?: string
          mentor_id: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          creator_id?: string
          id?: string
          mentor_id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_creator_assignments_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_creator_assignments_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_feedback: {
        Row: {
          created_at: string
          creator_id: string
          emailed: boolean
          feedback: string
          id: string
          mentor_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          emailed?: boolean
          feedback: string
          id?: string
          mentor_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          emailed?: boolean
          feedback?: string
          id?: string
          mentor_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_feedback_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_feedback_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_feedback_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_plans: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          mentor_id: string
          notes: string | null
          reference_links: Json | null
          script_text: string | null
          status: string
          updated_at: string
          video_call_url: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          mentor_id: string
          notes?: string | null
          reference_links?: Json | null
          script_text?: string | null
          status?: string
          updated_at?: string
          video_call_url?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          mentor_id?: string
          notes?: string | null
          reference_links?: Json | null
          script_text?: string | null
          status?: string
          updated_at?: string
          video_call_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_plans_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_plans_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          audio_url: string | null
          chat_id: string | null
          content: string
          created_at: string
          dm_id: string | null
          highlighted_video_id: string | null
          id: string
          image_url: string | null
          reply_to_id: string | null
          sender_id: string | null
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          chat_id?: string | null
          content: string
          created_at?: string
          dm_id?: string | null
          highlighted_video_id?: string | null
          id?: string
          image_url?: string | null
          reply_to_id?: string | null
          sender_id?: string | null
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          chat_id?: string | null
          content?: string
          created_at?: string
          dm_id?: string | null
          highlighted_video_id?: string | null
          id?: string
          image_url?: string | null
          reply_to_id?: string | null
          sender_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_dm_id_fkey"
            columns: ["dm_id"]
            isOneToOne: false
            referencedRelation: "direct_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_highlighted_video_id_fkey"
            columns: ["highlighted_video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_mappings: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          meta_ad_id: string
          meta_ad_name: string | null
          updated_at: string
          video_id: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          meta_ad_id: string
          meta_ad_name?: string | null
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          meta_ad_id?: string
          meta_ad_name?: string | null
          updated_at?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_mappings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_mappings_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_api_logs: {
        Row: {
          created_at: string
          error_code: number | null
          error_message: string | null
          error_subcode: number | null
          error_type: string | null
          fbtrace_id: string | null
          function_name: string
          id: string
          request_params: Json | null
          request_url: string | null
          response_data: Json | null
        }
        Insert: {
          created_at?: string
          error_code?: number | null
          error_message?: string | null
          error_subcode?: number | null
          error_type?: string | null
          fbtrace_id?: string | null
          function_name: string
          id?: string
          request_params?: Json | null
          request_url?: string | null
          response_data?: Json | null
        }
        Update: {
          created_at?: string
          error_code?: number | null
          error_message?: string | null
          error_subcode?: number | null
          error_type?: string | null
          fbtrace_id?: string | null
          function_name?: string
          id?: string
          request_params?: Json | null
          request_url?: string | null
          response_data?: Json | null
        }
        Relationships: []
      }
      meta_credentials: {
        Row: {
          access_token: string | null
          ad_account_id: string | null
          connected_at: string | null
          created_at: string
          default_link: string | null
          expires_at: string | null
          id: string
          page_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          ad_account_id?: string | null
          connected_at?: string | null
          created_at?: string
          default_link?: string | null
          expires_at?: string | null
          id?: string
          page_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          ad_account_id?: string | null
          connected_at?: string | null
          created_at?: string
          default_link?: string | null
          expires_at?: string | null
          id?: string
          page_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_objects: {
        Row: {
          ad_account_id: string
          adset_id: string | null
          campaign_id: string | null
          created_at: string | null
          daily_budget: number | null
          effective_status: string | null
          id: string
          level: string
          lifetime_budget: number | null
          meta_data: Json | null
          object_id: string
          object_name: string | null
          objective: string | null
          status: string | null
          synced_at: string | null
          targeting: Json | null
          updated_at: string | null
        }
        Insert: {
          ad_account_id: string
          adset_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          daily_budget?: number | null
          effective_status?: string | null
          id?: string
          level?: string
          lifetime_budget?: number | null
          meta_data?: Json | null
          object_id: string
          object_name?: string | null
          objective?: string | null
          status?: string | null
          synced_at?: string | null
          targeting?: Json | null
          updated_at?: string | null
        }
        Update: {
          ad_account_id?: string
          adset_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          daily_budget?: number | null
          effective_status?: string | null
          id?: string
          level?: string
          lifetime_budget?: number | null
          meta_data?: Json | null
          object_id?: string
          object_name?: string | null
          objective?: string | null
          status?: string | null
          synced_at?: string | null
          targeting?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          email_sent: boolean | null
          id: string
          link: string | null
          message: string
          notification_type: string | null
          read: boolean | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_sent?: boolean | null
          id?: string
          link?: string | null
          message: string
          notification_type?: string | null
          read?: boolean | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_sent?: boolean | null
          id?: string
          link?: string | null
          message?: string
          notification_type?: string | null
          read?: boolean | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_reminders: {
        Row: {
          application_id: string
          created_at: string
          email: string
          id: string
          reminder_day: number
          sent_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          email: string
          id?: string
          reminder_day: number
          sent_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          email?: string
          id?: string
          reminder_day?: number
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_reminders_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "referral_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      partnership_permissions: {
        Row: {
          approved_at: string | null
          brand_id: string
          created_at: string
          creator_id: string
          id: string
          meta_permission_id: string | null
          permission_status: string
          requested_at: string
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          brand_id: string
          created_at?: string
          creator_id: string
          id?: string
          meta_permission_id?: string | null
          permission_status?: string
          requested_at?: string
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          brand_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          meta_permission_id?: string | null
          permission_status?: string
          requested_at?: string
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partnership_permissions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_permissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          created_at: string
          creator_id: string
          id: string
          notes: string | null
          paid_at: string | null
          payout_type: string
          reference_id: string | null
          status: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          creator_id: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payout_type: string
          reference_id?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          creator_id?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payout_type?: string
          reference_id?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_data: {
        Row: {
          clicks: number | null
          commission_rate_at_time: number | null
          created_at: string
          id: string
          impressions: number | null
          metric_date: string
          purchases: number | null
          recorded_at: string
          revenue: number | null
          spend: number | null
          updated_at: string
          video_id: string
        }
        Insert: {
          clicks?: number | null
          commission_rate_at_time?: number | null
          created_at?: string
          id?: string
          impressions?: number | null
          metric_date: string
          purchases?: number | null
          recorded_at?: string
          revenue?: number | null
          spend?: number | null
          updated_at?: string
          video_id: string
        }
        Update: {
          clicks?: number | null
          commission_rate_at_time?: number | null
          created_at?: string
          id?: string
          impressions?: number | null
          metric_date?: string
          purchases?: number | null
          recorded_at?: string
          revenue?: number | null
          spend?: number | null
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_data_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_digests: {
        Row: {
          created_at: string
          digest_data: Json
          id: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          digest_data: Json
          id?: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          digest_data?: Json
          id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      photo_submissions: {
        Row: {
          admin_notes: string | null
          bounty_id: string | null
          created_at: string
          creative_name: string | null
          creator_id: string
          edited_count: number
          id: string
          link_url: string | null
          meta_creative_ids: string[] | null
          meta_error_reason: string | null
          meta_status: string | null
          meta_uploaded_at: string | null
          notes: string | null
          photo_urls: string[]
          raw_count: number
          reviewed_by: string | null
          status: string
          thumbnail_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          bounty_id?: string | null
          created_at?: string
          creative_name?: string | null
          creator_id: string
          edited_count?: number
          id?: string
          link_url?: string | null
          meta_creative_ids?: string[] | null
          meta_error_reason?: string | null
          meta_status?: string | null
          meta_uploaded_at?: string | null
          notes?: string | null
          photo_urls?: string[]
          raw_count?: number
          reviewed_by?: string | null
          status?: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          bounty_id?: string | null
          created_at?: string
          creative_name?: string | null
          creator_id?: string
          edited_count?: number
          id?: string
          link_url?: string | null
          meta_creative_ids?: string[] | null
          meta_error_reason?: string | null
          meta_status?: string | null
          meta_uploaded_at?: string | null
          notes?: string | null
          photo_urls?: string[]
          raw_count?: number
          reviewed_by?: string | null
          status?: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_submissions_bounty_id_fkey"
            columns: ["bounty_id"]
            isOneToOne: false
            referencedRelation: "bounties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_submissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_comments: {
        Row: {
          audio_url: string | null
          author_id: string
          content: string
          created_at: string
          id: string
          image_url: string | null
          item_id: string | null
          plan_id: string
        }
        Insert: {
          audio_url?: string | null
          author_id: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          item_id?: string | null
          plan_id: string
        }
        Update: {
          audio_url?: string | null
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          item_id?: string | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_comments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "mentor_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          color: string | null
          content: string | null
          created_at: string
          created_by: string
          id: string
          image_url: string | null
          note: string | null
          plan_id: string
          position_order: number | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          content?: string | null
          created_at?: string
          created_by: string
          id?: string
          image_url?: string | null
          note?: string | null
          plan_id: string
          position_order?: number | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          content?: string | null
          created_at?: string
          created_by?: string
          id?: string
          image_url?: string | null
          note?: string | null
          plan_id?: string
          position_order?: number | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "mentor_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          commission_percentage: number | null
          country: string | null
          created_at: string
          email: string
          email_notifications: boolean | null
          full_name: string
          id: string
          instagram_access_token: string | null
          instagram_business_account_id: string | null
          instagram_connected_at: string | null
          instagram_token_expires_at: string | null
          instagram_user_id: string | null
          instagram_username: string | null
          is_mentor: boolean
          notify_bounty_updates: boolean | null
          notify_payout_updates: boolean | null
          notify_video_updates: boolean | null
          partnership_ads_enabled: boolean | null
          payment_info: string | null
          payout_method: string
          paypal_email: string | null
          push_notifications_enabled: boolean | null
          social_handles: Json | null
          status: string
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          commission_percentage?: number | null
          country?: string | null
          created_at?: string
          email: string
          email_notifications?: boolean | null
          full_name: string
          id?: string
          instagram_access_token?: string | null
          instagram_business_account_id?: string | null
          instagram_connected_at?: string | null
          instagram_token_expires_at?: string | null
          instagram_user_id?: string | null
          instagram_username?: string | null
          is_mentor?: boolean
          notify_bounty_updates?: boolean | null
          notify_payout_updates?: boolean | null
          notify_video_updates?: boolean | null
          partnership_ads_enabled?: boolean | null
          payment_info?: string | null
          payout_method?: string
          paypal_email?: string | null
          push_notifications_enabled?: boolean | null
          social_handles?: Json | null
          status?: string
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          commission_percentage?: number | null
          country?: string | null
          created_at?: string
          email?: string
          email_notifications?: boolean | null
          full_name?: string
          id?: string
          instagram_access_token?: string | null
          instagram_business_account_id?: string | null
          instagram_connected_at?: string | null
          instagram_token_expires_at?: string | null
          instagram_user_id?: string | null
          instagram_username?: string | null
          is_mentor?: boolean
          notify_bounty_updates?: boolean | null
          notify_payout_updates?: boolean | null
          notify_video_updates?: boolean | null
          partnership_ads_enabled?: boolean | null
          payment_info?: string | null
          payout_method?: string
          paypal_email?: string | null
          push_notifications_enabled?: boolean | null
          social_handles?: Json | null
          status?: string
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_applications: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          instagram_handle: string
          phone_number: string | null
          referral_id: string | null
          referrer_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sample_video_url: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          instagram_handle: string
          phone_number?: string | null
          referral_id?: string | null
          referrer_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_video_url: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          instagram_handle?: string
          phone_number?: string | null
          referral_id?: string | null
          referrer_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_video_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_applications_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_applications_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          bonus_amount: number
          bonus_paid: boolean
          created_at: string
          id: string
          referee_email: string
          referee_id: string | null
          referrer_id: string
          status: string
          updated_at: string
        }
        Insert: {
          bonus_amount?: number
          bonus_paid?: boolean
          created_at?: string
          id?: string
          referee_email: string
          referee_id?: string | null
          referrer_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          bonus_amount?: number
          bonus_paid?: boolean
          created_at?: string
          id?: string
          referee_email?: string
          referee_id?: string | null
          referrer_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referee_id_fkey"
            columns: ["referee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          category: string
          content_body: string | null
          content_type: string
          content_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_published: boolean
          sort_order: number
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content_body?: string | null
          content_type?: string
          content_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content_body?: string | null
          content_type?: string
          content_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          shop_item_id: string
          status: string
          xp_spent: number
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_item_id: string
          status?: string
          xp_spent: number
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_item_id?: string
          status?: string
          xp_spent?: number
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_shop_item_id_fkey"
            columns: ["shop_item_id"]
            isOneToOne: false
            referencedRelation: "reward_shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_shop_items: {
        Row: {
          cash_value: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          reward_type: string
          title: string
          updated_at: string
          xp_cost: number
        }
        Insert: {
          cash_value?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          reward_type?: string
          title: string
          updated_at?: string
          xp_cost: number
        }
        Update: {
          cash_value?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          reward_type?: string
          title?: string
          updated_at?: string
          xp_cost?: number
        }
        Relationships: []
      }
      sample_requests: {
        Row: {
          admin_notes: string | null
          brand_id: string
          created_at: string
          creator_id: string
          delivered_at: string | null
          id: string
          product_description: string | null
          product_name: string
          rejection_reason: string | null
          shipped_at: string | null
          shipping_address: string
          shipping_city: string | null
          shipping_country: string | null
          shipping_state: string | null
          shipping_zip: string | null
          shopify_draft_order_id: string | null
          shopify_order_id: string | null
          shopify_product_id: string | null
          shopify_product_image: string | null
          shopify_product_title: string | null
          shopify_variant_id: string | null
          shopify_variant_title: string | null
          status: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          brand_id: string
          created_at?: string
          creator_id: string
          delivered_at?: string | null
          id?: string
          product_description?: string | null
          product_name: string
          rejection_reason?: string | null
          shipped_at?: string | null
          shipping_address: string
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          shopify_draft_order_id?: string | null
          shopify_order_id?: string | null
          shopify_product_id?: string | null
          shopify_product_image?: string | null
          shopify_product_title?: string | null
          shopify_variant_id?: string | null
          shopify_variant_title?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          brand_id?: string
          created_at?: string
          creator_id?: string
          delivered_at?: string | null
          id?: string
          product_description?: string | null
          product_name?: string
          rejection_reason?: string | null
          shipped_at?: string | null
          shipping_address?: string
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          shopify_draft_order_id?: string | null
          shopify_order_id?: string | null
          shopify_product_id?: string | null
          shopify_product_image?: string | null
          shopify_product_title?: string | null
          shopify_variant_id?: string | null
          shopify_variant_title?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_requests_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          chat_id: string | null
          content: string
          created_at: string
          dm_id: string | null
          id: string
          image_url: string | null
          scheduled_at: string
          sender_id: string
          sent: boolean
          sent_at: string | null
        }
        Insert: {
          chat_id?: string | null
          content: string
          created_at?: string
          dm_id?: string | null
          id?: string
          image_url?: string | null
          scheduled_at: string
          sender_id: string
          sent?: boolean
          sent_at?: string | null
        }
        Update: {
          chat_id?: string | null
          content?: string
          created_at?: string
          dm_id?: string | null
          id?: string
          image_url?: string | null
          scheduled_at?: string
          sender_id?: string
          sent?: boolean
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_dm_id_fkey"
            columns: ["dm_id"]
            isOneToOne: false
            referencedRelation: "direct_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      sticker_packs: {
        Row: {
          created_at: string
          icon_url: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      stickers: {
        Row: {
          created_at: string
          id: string
          image_url: string
          label: string | null
          pack_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          label?: string | null
          pack_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          label?: string | null
          pack_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "stickers_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_comments: {
        Row: {
          created_at: string
          id: string
          message: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_comments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_review_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender_id: string
          video_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender_id: string
          video_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_review_messages_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          admin_edited: boolean | null
          admin_feedback: string | null
          admin_feedback_stickers: string[] | null
          ai_creative_insights: Json | null
          analyzed_at: string | null
          approved_at: string | null
          bounty_id: string | null
          brand_id: string | null
          brief_id: string | null
          campaign_id: string | null
          commission_override: number | null
          created_at: string
          creator_id: string
          creator_instagram_handle: string | null
          description: string | null
          hook_analysis: string | null
          hook_score: number | null
          id: string
          mentor_verdict: string | null
          mentor_verdict_at: string | null
          mentor_verdict_by: string | null
          mentor_verdict_notes: string | null
          meta_creative_id: string | null
          meta_error_reason: string | null
          meta_status: string | null
          meta_uploaded_at: string | null
          meta_video_id: string | null
          rejection_reason: string | null
          rejection_reason_code: string | null
          similarity_flag: boolean
          similarity_reason: string | null
          status: Database["public"]["Enums"]["video_status"]
          thumbnail_url: string | null
          title: string
          unique_video_id: string
          updated_at: string
          video_url: string | null
          whitelisted_at: string | null
          whitelisting_approved: boolean | null
        }
        Insert: {
          admin_edited?: boolean | null
          admin_feedback?: string | null
          admin_feedback_stickers?: string[] | null
          ai_creative_insights?: Json | null
          analyzed_at?: string | null
          approved_at?: string | null
          bounty_id?: string | null
          brand_id?: string | null
          brief_id?: string | null
          campaign_id?: string | null
          commission_override?: number | null
          created_at?: string
          creator_id: string
          creator_instagram_handle?: string | null
          description?: string | null
          hook_analysis?: string | null
          hook_score?: number | null
          id?: string
          mentor_verdict?: string | null
          mentor_verdict_at?: string | null
          mentor_verdict_by?: string | null
          mentor_verdict_notes?: string | null
          meta_creative_id?: string | null
          meta_error_reason?: string | null
          meta_status?: string | null
          meta_uploaded_at?: string | null
          meta_video_id?: string | null
          rejection_reason?: string | null
          rejection_reason_code?: string | null
          similarity_flag?: boolean
          similarity_reason?: string | null
          status?: Database["public"]["Enums"]["video_status"]
          thumbnail_url?: string | null
          title: string
          unique_video_id: string
          updated_at?: string
          video_url?: string | null
          whitelisted_at?: string | null
          whitelisting_approved?: boolean | null
        }
        Update: {
          admin_edited?: boolean | null
          admin_feedback?: string | null
          admin_feedback_stickers?: string[] | null
          ai_creative_insights?: Json | null
          analyzed_at?: string | null
          approved_at?: string | null
          bounty_id?: string | null
          brand_id?: string | null
          brief_id?: string | null
          campaign_id?: string | null
          commission_override?: number | null
          created_at?: string
          creator_id?: string
          creator_instagram_handle?: string | null
          description?: string | null
          hook_analysis?: string | null
          hook_score?: number | null
          id?: string
          mentor_verdict?: string | null
          mentor_verdict_at?: string | null
          mentor_verdict_by?: string | null
          mentor_verdict_notes?: string | null
          meta_creative_id?: string | null
          meta_error_reason?: string | null
          meta_status?: string | null
          meta_uploaded_at?: string | null
          meta_video_id?: string | null
          rejection_reason?: string | null
          rejection_reason_code?: string | null
          similarity_flag?: boolean
          similarity_reason?: string | null
          status?: Database["public"]["Enums"]["video_status"]
          thumbnail_url?: string | null
          title?: string
          unique_video_id?: string
          updated_at?: string
          video_url?: string | null
          whitelisted_at?: string | null
          whitelisting_approved?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_bounty_id_fkey"
            columns: ["bounty_id"]
            isOneToOne: false
            referencedRelation: "bounties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "creative_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_mentor_verdict_by_fkey"
            columns: ["mentor_verdict_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_challenges: {
        Row: {
          bonus_reward: number | null
          challenge_type: string
          cohort_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_recurring: boolean
          target_value: number
          title: string
          week_end: string
          week_start: string
          xp_reward: number
        }
        Insert: {
          bonus_reward?: number | null
          challenge_type: string
          cohort_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          target_value: number
          title: string
          week_end: string
          week_start: string
          xp_reward?: number
        }
        Update: {
          bonus_reward?: number | null
          challenge_type?: string
          cohort_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          target_value?: number
          title?: string
          week_end?: string
          week_start?: string
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_challenges_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "creator_cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_level: { Args: { xp: number }; Returns: number }
      get_my_cohort_ids: { Args: never; Returns: string[] }
      get_my_profile_id: { Args: never; Returns: string }
      get_next_video_sequence: {
        Args: { target_date: string }
        Returns: number
      }
      get_pending_agreement_for_creator: {
        Args: { _creator_id: string }
        Returns: {
          accept_deadline: string | null
          audience: string
          body: string
          created_at: string
          created_by: string | null
          effective_at: string
          id: string
          is_active: boolean
          required: boolean
          title: string
          updated_at: string
          version: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agreements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_revenue_summary: {
        Args: never
        Returns: {
          month_revenue: number
          total_commissions: number
          total_revenue: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      xp_for_level: { Args: { level: number }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "creator"
      bounty_status: "active" | "completed" | "cancelled"
      payout_status: "pending" | "approved" | "paid"
      video_status:
        | "pending"
        | "approved"
        | "rejected"
        | "revision_requested"
        | "saved_for_later"
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
      app_role: ["admin", "creator"],
      bounty_status: ["active", "completed", "cancelled"],
      payout_status: ["pending", "approved", "paid"],
      video_status: [
        "pending",
        "approved",
        "rejected",
        "revision_requested",
        "saved_for_later",
      ],
    },
  },
} as const
