import { sendNotification } from "./notifications";

/**
 * Centralized event helpers for the cohort agreement lifecycle.
 * Each function wraps `sendNotification` so the message lands in the in-app
 * NotificationBell AND the user's inbox via Resend (respecting their prefs).
 *
 * Tone: serious, direct. No game-show language. Use [Action Required] /
 * [Important] prefixes where the message demands a response.
 */

export const cohortEvents = {
  agreementPending: (userId: string, agreementTitle: string, deadline?: string) =>
    sendNotification({
      userId,
      title: `[Action Required] Sign your creator agreement${deadline ? ` by ${deadline}` : ""}`,
      message: `Please review and accept "${agreementTitle}"${deadline ? ` before ${deadline}` : ""}. You will not be able to continue posting or be eligible for commission until this is signed.`,
      notificationType: "general",
      link: "/creator",
    }),

  agreementAccepted: (userId: string, agreementTitle: string) =>
    sendNotification({
      userId,
      title: "Agreement on file",
      message: `Your acceptance of "${agreementTitle}" has been recorded. A copy is available in your profile for your records.`,
      notificationType: "general",
      link: "/creator/profile",
    }),

  offboarded: (userId: string, reason = "missed agreement deadline") =>
    sendNotification({
      userId,
      title: "[Important] Your account has been deactivated",
      message: `Your account has been set to inactive. Reason: ${reason}. If you would like to discuss reactivation, please contact your admin directly.`,
      notificationType: "general",
    }),
};
