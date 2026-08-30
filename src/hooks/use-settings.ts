import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CommissionSettings {
  default: number;
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
}

interface PayoutThresholdSettings {
  minimum: number;
}

interface VideoReviewSettings {
  auto_approve: boolean;
  require_review: boolean;
}

interface NotificationSettings {
  email_enabled: boolean;
}

interface CreatorMetricsSettings {
  impressions: boolean;
  link_clicks: boolean;
  link_ctr: boolean;
  conversions: boolean;
  aov: boolean;
}

interface AnalyticsSettings {
  timezone: string;
  creator_metrics: CreatorMetricsSettings;
}

interface AppSettings {
  commission: CommissionSettings;
  payout_threshold: PayoutThresholdSettings;
  video_review: VideoReviewSettings;
  notifications: NotificationSettings;
  analytics: AnalyticsSettings;
}

const defaultSettings: AppSettings = {
  commission: { default: 10, bronze: 10, silver: 12, gold: 13, platinum: 15 },
  payout_threshold: { minimum: 50 },
  video_review: { auto_approve: false, require_review: true },
  notifications: { email_enabled: true },
  analytics: {
    timezone: "America/Los_Angeles",
    creator_metrics: { impressions: true, link_clicks: true, link_ctr: false, conversions: true, aov: false },
  },
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("key, value");

      if (error) throw error;

      if (data) {
        const settingsMap: Partial<AppSettings> = {};
        data.forEach((row) => {
          if (row.key === "commission") settingsMap.commission = row.value as unknown as CommissionSettings;
          if (row.key === "payout_threshold") settingsMap.payout_threshold = row.value as unknown as PayoutThresholdSettings;
          if (row.key === "video_review") settingsMap.video_review = row.value as unknown as VideoReviewSettings;
          if (row.key === "notifications") settingsMap.notifications = row.value as unknown as NotificationSettings;
          if (row.key === "analytics") settingsMap.analytics = row.value as unknown as AnalyticsSettings;
        });
        setSettings({ ...defaultSettings, ...settingsMap });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("settings")
        .update({ value: value as any })
        .eq("key", key);

      if (error) throw error;

      setSettings((prev) => ({ ...prev, [key]: value }));
      return true;
    } catch (error) {
      console.error("Error updating setting:", error);
      return false;
    }
  }

  async function saveAllSettings(newSettings: AppSettings): Promise<boolean> {
    try {
      const updates = Object.entries(newSettings).map(([key, value]) => ({
        key,
        value,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("settings")
          .upsert({ key: update.key, value: update.value as any }, { onConflict: "key" });

        if (error) throw error;
      }

      setSettings(newSettings);
      return true;
    } catch (error) {
      console.error("Error saving settings:", error);
      return false;
    }
  }

  return {
    settings,
    loading,
    updateSetting,
    saveAllSettings,
    refetch: fetchSettings,
  };
}
