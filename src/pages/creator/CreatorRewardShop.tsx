import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, DollarSign, Zap, Star, Clock, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface ShopItem {
  id: string;
  title: string;
  description: string | null;
  xp_cost: number;
  reward_type: string;
  cash_value: number | null;
  is_active: boolean;
}

interface Redemption {
  id: string;
  xp_spent: number;
  status: string;
  created_at: string;
  shop_item: { title: string } | null;
}

export default function CreatorRewardShop() {
  const { profileId } = useAuth();
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [redeemableXp, setRedeemableXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  useEffect(() => {
    if (profileId) fetchAll();
  }, [profileId]);

  async function fetchAll() {
    try {
      const [itemsRes, xpRes, redemptionsRes] = await Promise.all([
        supabase.from("reward_shop_items").select("*").eq("is_active", true).order("xp_cost", { ascending: true }),
        supabase.from("creator_gamification").select("redeemable_xp").eq("creator_id", profileId!).single(),
        supabase
          .from("reward_redemptions")
          .select("id, xp_spent, status, created_at, shop_item:reward_shop_items(title)")
          .eq("creator_id", profileId!)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      setShopItems((itemsRes.data as any[]) || []);
      setRedeemableXp(xpRes.data?.redeemable_xp || 0);
      setRedemptions((redemptionsRes.data as any[]) || []);
    } catch (error) {
      console.error("Error fetching shop data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRedeem(item: ShopItem) {
    if (redeemableXp < item.xp_cost) {
      toast.error("Not enough XP for this reward");
      return;
    }

    setRedeeming(item.id);
    try {
      // Deduct XP
      const { error: xpError } = await supabase
        .from("creator_gamification")
        .update({ redeemable_xp: redeemableXp - item.xp_cost })
        .eq("creator_id", profileId!);

      if (xpError) throw xpError;

      // Create redemption request
      const { error: redeemError } = await supabase.from("reward_redemptions").insert({
        creator_id: profileId!,
        shop_item_id: item.id,
        xp_spent: item.xp_cost,
        status: "pending",
      });

      if (redeemError) throw redeemError;

      toast.success("Reward redeemed! Pending admin approval.");
      fetchAll();
    } catch (error) {
      console.error("Error redeeming:", error);
      toast.error("Failed to redeem reward");
    } finally {
      setRedeeming(null);
    }
  }

  const getRewardIcon = (type: string) => {
    switch (type) {
      case "cash": return <DollarSign className="w-5 h-5" />;
      case "boost": return <Zap className="w-5 h-5" />;
      case "priority": return <Star className="w-5 h-5" />;
      default: return <Gift className="w-5 h-5" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge className="bg-success/10 text-success border-0 gap-1"><CheckCircle className="w-3 h-3" />Approved</Badge>;
      case "rejected": return <Badge className="bg-destructive/10 text-destructive border-0 gap-1"><XCircle className="w-3 h-3" />Rejected</Badge>;
      default: return <Badge className="bg-warning/10 text-warning border-0 gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <CreatorLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-24 bg-muted rounded-xl" />
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-muted rounded-xl" />)}
          </div>
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Gift className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            Reward Shop
          </h1>
          <p className="text-sm text-muted-foreground">Trade your earned XP for real rewards</p>
        </div>

        {/* XP Balance */}
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Your Spendable Balance</p>
              <p className="text-3xl font-bold text-primary">{redeemableXp.toLocaleString()} XP</p>
              <p className="text-xs text-muted-foreground">≈ ${(redeemableXp / 100).toFixed(2)} value</p>
            </div>
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Gift className="w-7 h-7 text-primary" />
            </div>
          </CardContent>
        </Card>

        {/* Shop Items */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shopItems.map((item) => {
            const canAfford = redeemableXp >= item.xp_cost;
            return (
              <Card key={item.id} className={!canAfford ? "opacity-60" : ""}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      {getRewardIcon(item.reward_type)}
                    </div>
                    {item.cash_value && (
                      <Badge variant="secondary">${Number(item.cash_value).toFixed(2)}</Badge>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{item.title}</h3>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-primary">{item.xp_cost.toLocaleString()} XP</span>
                    <Button
                      size="sm"
                      disabled={!canAfford || redeeming === item.id}
                      onClick={() => handleRedeem(item)}
                    >
                      {redeeming === item.id ? "Redeeming..." : "Redeem"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Redemption History */}
        {redemptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Redemption History</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {redemptions.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{(r.shop_item as any)?.title || "Reward"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()} · {r.xp_spent.toLocaleString()} XP
                    </p>
                  </div>
                  {getStatusBadge(r.status)}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </CreatorLayout>
  );
}
