import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Zap, Loader2, Shield, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";
import { z } from "zod";

const accountSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const brandSchema = z.object({
  brandName: z.string().min(2, "Enter your brand name"),
  websiteUrl: z.string().url("Enter a valid URL (https://...)").or(z.literal("")),
  commissionRate: z.coerce.number().min(0).max(100),
});

export default function OwnerSetup() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [checking, setChecking] = useState(true);
  const [alreadySetUp, setAlreadySetUp] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [commissionRate, setCommissionRate] = useState("10");

  useEffect(() => {
    const wasDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.add("dark");
    return () => {
      if (!wasDark) document.documentElement.classList.remove("dark");
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("owner-bootstrap", {
          body: { action: "status" },
        });
        if (error) throw error;
        setAlreadySetUp(!data?.needsSetup);
      } catch {
        setAlreadySetUp(false);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  function goToBrandStep() {
    const result = accountSchema.safeParse({ fullName, email, password });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((e) => {
        if (e.path[0]) fieldErrors[e.path[0] as string] = e.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setStep(2);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const result = brandSchema.safeParse({ brandName, websiteUrl, commissionRate });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("owner-bootstrap", {
        body: {
          action: "create",
          email,
          password,
          full_name: fullName,
          brand_name: brandName,
          website_url: websiteUrl,
          commission_rate: Number(commissionRate),
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Setup failed");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        toast({
          title: "Owner account created",
          description: "Sign in with your new credentials to continue.",
        });
        navigate("/");
        return;
      }

      toast({
        title: "Welcome aboard",
        description: "Your owner account is ready. Next: add your API keys in Setup.",
      });
      navigate("/admin/setup");
    } catch (err) {
      toast({
        title: "Setup failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (alreadySetUp) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">Already set up</h1>
          <p className="text-muted-foreground mb-6">
            This platform already has an owner account. Sign in, or ask an admin for an invite link.
          </p>
          <Button asChild>
            <Link to="/">Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-background">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary opacity-[0.08] blur-[120px] animate-float" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-accent opacity-[0.06] blur-[100px] animate-float" style={{ animationDelay: "-3s" }} />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src={logo} alt="Creators Control" className="w-12 h-12 rounded-2xl shadow-glow-md" />
          <span className="font-semibold text-2xl text-foreground">Creators Control</span>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-3 mb-6">
          {[1, 2].map((n) => (
            <div key={n} className="flex-1 flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {step > n ? <CheckCircle2 className="w-4 h-4" /> : n}
              </div>
              <span className="text-xs text-muted-foreground">
                {n === 1 ? "Owner account" : "Your brand"}
              </span>
            </div>
          ))}
        </div>

        <div className="bg-card/80 backdrop-blur-2xl border border-border/50 rounded-2xl p-6 shadow-2xl">
          <h1 className="text-xl font-semibold mb-1 text-center text-foreground">
            {step === 1 ? "Create your owner account" : "Tell us about your brand"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            {step === 1
              ? "This is the first admin on your platform — it can only be created once."
              : "Creators are auto-assigned to this brand when they join."}
          </p>

          {step === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className={errors.fullName ? "border-destructive" : ""}
                />
                {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourbrand.com"
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={errors.password ? "border-destructive" : ""}
                />
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
              </div>
              <Button
                type="button"
                onClick={goToBrandStep}
                className="w-full bg-gradient-purple hover:opacity-90 shadow-glow-sm text-white"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Brand name</Label>
                <Input
                  id="brandName"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Seya Garments"
                  className={errors.brandName ? "border-destructive" : ""}
                />
                {errors.brandName && <p className="text-sm text-destructive">{errors.brandName}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Website (optional)</Label>
                <Input
                  id="websiteUrl"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourbrand.com"
                  className={errors.websiteUrl ? "border-destructive" : ""}
                />
                {errors.websiteUrl && <p className="text-sm text-destructive">{errors.websiteUrl}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="commissionRate">Default creator commission (%)</Label>
                <Input
                  id="commissionRate"
                  type="number"
                  min={0}
                  max={100}
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className={errors.commissionRate ? "border-destructive" : ""}
                />
                {errors.commissionRate && (
                  <p className="text-sm text-destructive">{errors.commissionRate}</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={isLoading}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-gradient-purple hover:opacity-90 shadow-glow-sm text-white"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Create owner account
                </Button>
              </div>
            </form>
          )}
        </div>

        <p className="text-xs text-muted-foreground/60 text-center mt-6">
          After setup you'll land on <span className="text-foreground/80">Admin → Setup</span> to add your
          Shopify, Stripe, Resend, Meta and AI keys.
        </p>
      </div>
    </div>
  );
}
