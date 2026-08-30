import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cohortEvents } from "@/lib/cohort-events";

type PendingAgreement = {
  id: string;
  version: string;
  title: string;
  body: string;
  accept_deadline: string | null;
};

export function AgreementGate() {
  const { user, profileId, role } = useAuth();
  const [pending, setPending] = useState<PendingAgreement | null>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!profileId || role !== "creator") {
      setPending(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_pending_agreement_for_creator", {
        _creator_id: profileId,
      });
      if (cancelled || error || !data || data.length === 0) return;
      const a = data[0] as PendingAgreement;
      setPending(a);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, role]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) {
      setScrolledToBottom(true);
    }
  }

  async function handleAccept() {
    if (!pending || !profileId || !user) return;
    setSubmitting(true);
    const { error } = await supabase.from("agreement_acceptances").insert({
      agreement_id: pending.id,
      creator_id: profileId,
      app_version: import.meta.env.VITE_APP_VERSION ?? "web",
      user_agent: navigator.userAgent,
    });
    if (error) {
      toast.error("Couldn't record acceptance — try again.");
      setSubmitting(false);
      return;
    }
    cohortEvents.agreementAccepted(user.id, pending.title).catch(() => {});
    toast.success("Agreement accepted");
    setPending(null);
    setSubmitting(false);
    setAgreed(false);
    setScrolledToBottom(false);
  }

  if (!pending) return null;

  return (
    <Dialog open={true}>
      <DialogContent
        className="max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{pending.title}</DialogTitle>
          <DialogDescription>
            Version {pending.version}
            {pending.accept_deadline && (
              <span className="ml-2 text-destructive">
                · Deadline: {new Date(pending.accept_deadline).toLocaleDateString()}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[50vh] rounded-md border p-4" onScrollCapture={handleScroll}>
          <div ref={scrollRef} className="whitespace-pre-wrap text-sm leading-relaxed">
            {pending.body}
          </div>
        </ScrollArea>

        <div className="flex items-start gap-2">
          <Checkbox
            id="agree"
            checked={agreed}
            disabled={!scrolledToBottom}
            onCheckedChange={(c) => setAgreed(!!c)}
          />
          <label htmlFor="agree" className="text-sm leading-tight">
            I have read and agree to the terms above.
            {!scrolledToBottom && (
              <span className="block text-xs text-muted-foreground mt-1">
                Scroll to the bottom to enable.
              </span>
            )}
          </label>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleAccept} disabled={!agreed || submitting}>
            {submitting ? "Recording…" : "Agree & continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
