import { supabase } from "@/integrations/supabase/client";

export type NotificationType = "video" | "payout" | "bounty" | "general";

interface SendNotificationParams {
  userId: string;
  title: string;
  message: string;
  notificationType: NotificationType;
  link?: string;
}

/**
 * Sends a notification to a user via the edge function.
 * This creates an in-app notification and sends an email if the user has enabled email notifications.
 */
export async function sendNotification({
  userId,
  title,
  message,
  notificationType,
  link,
}: SendNotificationParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-notification-email", {
      body: {
        user_id: userId,
        title,
        message,
        notification_type: notificationType,
        link,
      },
    });

    if (error) {
      console.error("Error sending notification:", error);
      return { success: false, error: error.message };
    }

    console.log("Notification sent:", data);
    return { success: true };
  } catch (err: any) {
    console.error("Error invoking notification function:", err);
    return { success: false, error: err.message };
  }
}

interface CreatorJoinedNotificationParams {
  creatorName: string;
  creatorEmail: string;
  brandName?: string;
}

/**
 * Notifies all admin users when a new creator joins the platform.
 */
export async function notifyAdminsOfNewCreator({
  creatorName,
  creatorEmail,
  brandName,
}: CreatorJoinedNotificationParams): Promise<void> {
  try {
    // Get all admin user IDs
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (rolesError || !adminRoles?.length) {
      console.log("No admin users found to notify");
      return;
    }

    const brandText = brandName ? ` for ${brandName}` : "";
    
    // Send notification to each admin
    const notifications = adminRoles.map((admin) =>
      sendNotification({
        userId: admin.user_id,
        title: "New creator just signed up 👀",
        message: `${creatorName} (${creatorEmail}) just joined the platform${brandText}.`,
        notificationType: "general",
        link: "/admin/creators",
      })
    );

    await Promise.all(notifications);
    console.log(`Notified ${adminRoles.length} admin(s) about new creator: ${creatorName}`);
  } catch (err) {
    console.error("Error notifying admins of new creator:", err);
  }
}
