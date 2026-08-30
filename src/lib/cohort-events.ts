import { sendNotification } from "./notifications";

/**
 * Centralized event helpers for the cohort agreement + eligibility lifecycle.
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

  missedDayWarning: (userId: string, missedCount: number, allowedMisses: number) =>
    sendNotification({
      userId,
      title: "[Important] Missed required upload day",
      message: `You did not meet the upload requirement on a required day. Current standing: ${missedCount} of ${allowedMisses} allowed misses this month. Reaching the limit will forfeit this month's commission. Please return to your normal upload schedule.`,
      notificationType: "video",
      link: "/creator/calendar",
    }),

  atRisk: (userId: string, missedCount: number, allowedMisses: number) =>
    sendNotification({
      userId,
      title: "[Action Required] One miss away from forfeiting commission",
      message: `You have missed ${missedCount} of ${allowedMisses} allowed days this month. One additional missed day will make you ineligible for this month's payout. Please upload today to remain on track.`,
      notificationType: "video",
      link: "/creator/calendar",
    }),

  monthEligible: (userId: string, commissionPreview: number) =>
    sendNotification({
      userId,
      title: "Eligibility confirmed for this month",
      message: `You have met the requirements for this month's commission. Estimated amount: $${commissionPreview.toFixed(2)}. Payout processing will begin shortly.`,
      notificationType: "payout",
      link: "/creator/payouts",
    }),

  monthIneligible: (userId: string, missedDays: number) =>
    sendNotification({
      userId,
      title: "[Important] Commission forfeited this month",
      message: `You reached ${missedDays} missed days, exceeding the monthly threshold. This month's commission will not be paid and does not roll over. Eligibility resets on the 1st of next month.`,
      notificationType: "payout",
      link: "/creator/calendar",
    }),

  offboarded: (userId: string, reason = "missed agreement deadline") =>
    sendNotification({
      userId,
      title: "[Important] Your account has been deactivated",
      message: `Your account has been set to inactive. Reason: ${reason}. If you would like to discuss reactivation, please contact your admin directly.`,
      notificationType: "general",
    }),
};
