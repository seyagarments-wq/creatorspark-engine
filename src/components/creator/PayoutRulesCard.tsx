import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Calendar, CheckCircle2, AlertTriangle, DollarSign } from "lucide-react";
import { useFirstVisitEffect } from "@/hooks/use-first-visit-effect";

const STORAGE_KEY = "payout_rules_dismissed_session";

export function PayoutRulesCard() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useFirstVisitEffect("payout_rules_seen", true, () => {});

  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-4 md:p-5 relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-7 w-7"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </Button>
        <h3 className="font-semibold text-base md:text-lg mb-3 pr-8">How payout works</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>
              <strong>Tue · Thu · Sat</strong> required upload days
            </span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>
              <strong>4 approved minimum</strong> per day (5 = full credit)
            </span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <span>
              Miss <strong>more than 3 days</strong> → no commission this month
            </span>
          </div>
          <div className="flex items-start gap-2">
            <DollarSign className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>
              <strong>Monthly payouts only</strong> — no rollover, forfeits are lost
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
