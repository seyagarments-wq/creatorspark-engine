import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Check, Mail } from "lucide-react";

interface Brand {
  id: string;
  name: string;
}

interface InviteCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInviteSent?: () => void;
}

export default function InviteCreatorDialog({
  open,
  onOpenChange,
  onInviteSent,
}: InviteCreatorDialogProps) {
  const [email, setEmail] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchBrands();
    }
  }, [open]);

  async function fetchBrands() {
    const { data, error } = await supabase
      .from("brands")
      .select("id, name")
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setBrands(data);
      // Auto-select first brand if available
      if (data.length > 0 && !selectedBrandId) {
        setSelectedBrandId(data[0].id);
      }
    }
  }

  // Get the production URL for invite links
  function getBaseUrl() {
    // Use published URL if available, otherwise fall back to current origin
    const publishedUrl = "https://creatorsctrl.com";
    // In production, always use the published URL
    if (window.location.hostname.includes('lovable.app') || window.location.hostname.includes('localhost')) {
      return publishedUrl;
    }
    return window.location.origin;
  }

  async function handleSendInvite() {
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    if (!selectedBrandId) {
      toast({
        title: "Brand required",
        description: "Please select a brand for this creator",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Check if email already has an active invite
      const { data: existingInvite } = await supabase
        .from("invites")
        .select("*")
        .eq("email", email.toLowerCase())
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (existingInvite) {
        // Show existing invite link
        const link = `${getBaseUrl()}/auth?invite=${existingInvite.token}`;
        setInviteLink(link);
        toast({
          title: "Invite already exists",
          description: "This email already has an active invite. You can share the link below.",
        });
        return;
      }

      // Get current user's ID for invited_by tracking
      const { data: { user } } = await supabase.auth.getUser();

      // Create new invite with brand_id and invited_by
      const { data: invite, error } = await supabase
        .from("invites")
        .insert({
          email: email.toLowerCase(),
          role: "creator",
          brand_id: selectedBrandId,
          invited_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      const link = `${getBaseUrl()}/auth?invite=${invite.token}`;
      setInviteLink(link);

      const selectedBrand = brands.find(b => b.id === selectedBrandId);

      // Send the invite email
      const { error: emailError } = await supabase.functions.invoke("send-invite-email", {
        body: {
          email: email.toLowerCase(),
          brand_name: selectedBrand?.name || "Creatorsctrl",
          invite_link: link,
        },
      });

      if (emailError) {
        console.error("Failed to send invite email:", emailError);
        toast({
          title: "Invite created",
          description: `Invite created but email failed to send. You can share the link manually.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Invite sent!",
          description: `Email sent to ${email} with their invite link.`,
        });
      }

      onInviteSent?.();
    } catch (error: any) {
      console.error("Error creating invite:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create invite",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleCopyLink() {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: "Invite link copied to clipboard",
      });
    }
  }

  function handleClose() {
    setEmail("");
    setInviteLink(null);
    setCopied(false);
    setSelectedBrandId(brands.length > 0 ? brands[0].id : "");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Creator</DialogTitle>
          <DialogDescription>
            Send an invite link to a new creator. They'll use this link to sign up and be assigned to the selected brand.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!inviteLink ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="invite-brand">Brand</Label>
                <Select
                  value={selectedBrandId}
                  onValueChange={setSelectedBrandId}
                  disabled={loading}
                >
                  <SelectTrigger id="invite-brand">
                    <SelectValue placeholder="Select a brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {brands.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No active brands found. Create a brand first.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-email">Creator's Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="creator@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                <div className="flex items-center gap-2 text-success mb-2">
                  <Check className="w-4 h-4" />
                  <span className="font-medium">Invite Created!</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Share this link with <strong>{email}</strong>:
                </p>
              </div>

              <div className="flex gap-2">
                <Input
                  value={inviteLink}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                This invite expires in 7 days.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {inviteLink ? "Done" : "Cancel"}
          </Button>
          {!inviteLink && (
            <Button
              variant="success"
              onClick={handleSendInvite}
              disabled={loading || !email.trim() || !selectedBrandId}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Mail className="w-4 h-4 mr-2" />
              Create Invite
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
