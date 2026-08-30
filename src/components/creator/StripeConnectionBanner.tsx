import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CreditCard, AlertCircle, X, ArrowRight } from "lucide-react";

interface StripeStatus {
  connected: boolean;
  onboarding_complete: boolean;
  payouts_enabled: boolean;
}

export function StripeConnectionBanner() {
  const { profileId } = useAuth();
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileId) {
      checkStripeStatus();
    }
  }, [profileId]);

  async function checkStripeStatus() {
    try {
      const { data, error } = await supabase.functions.invoke("check-connect-status");
      if (error) throw error;
      setStripeStatus({
        connected: data.connected || false,
        onboarding_complete: data.onboarding_complete || false,
        payouts_enabled: data.payouts_enabled || false,
      });
    } catch (error) {
      console.error("Error checking Stripe status:", error);
    } finally {
      setLoading(false);
    }
  }

  // Don't show if loading, dismissed, or fully connected
  if (loading || dismissed || stripeStatus?.payouts_enabled) {
    return null;
  }

  const isPartiallyConnected = stripeStatus?.connected && !stripeStatus.onboarding_complete;

  return (
    <div className="relative bg-gradient-to-r from-warning/10 via-warning/5 to-transparent border border-warning/20 rounded-lg md:rounded-xl p-2 md:p-4 mb-4 md:mb-6">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 md:top-3 right-2 md:right-3 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-3 h-3 md:w-4 md:h-4" />
      </button>
      
      <div className="flex items-center md:items-start gap-2 md:gap-4 pr-6 md:pr-0">
        {/* Icon - hidden on mobile */}
        <div className="hidden md:flex p-2.5 rounded-lg bg-warning/10 shrink-0">
          {isPartiallyConnected ? (
            <AlertCircle className="w-5 h-5 text-warning" />
          ) : (
            <CreditCard className="w-5 h-5 text-warning" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Mobile: Catchy one-liner */}
          <p className="md:hidden text-xs font-medium">
            {isPartiallyConnected
              ? "Your payouts are waiting!"
              : "Connect your bank to get paid!"}
          </p>
          
          {/* Desktop: Original title + description */}
          <div className="hidden md:block">
            <h3 className="font-semibold text-sm">
              {isPartiallyConnected
                ? "Complete your payout setup"
                : "Connect your bank account"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isPartiallyConnected
                ? "Finish setting up your payout account to receive earnings from your videos."
                : "Set up your payout account to receive earnings directly to your bank when your videos perform."}
            </p>
          </div>
        </div>
        
        <Button 
          size="sm" 
          variant="outline" 
          asChild 
          className="shrink-0 gap-1 md:gap-2 h-7 md:h-9 text-xs md:text-sm px-2 md:px-3"
        >
          <Link to="/creator/profile">
            <span className="md:hidden">
              {isPartiallyConnected ? "Finish" : "Connect"}
            </span>
            <span className="hidden md:inline">
              {isPartiallyConnected ? "Continue Setup" : "Connect Now"}
            </span>
            <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
