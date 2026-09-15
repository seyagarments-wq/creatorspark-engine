import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, Shield } from "lucide-react";
import logo from "@/assets/logo.png";
import { z } from "zod";


const authSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(2, "Name must be at least 2 characters").optional(),
});

interface InviteData {
  id: string;
  email: string;
  role: "admin" | "creator";
  expires_at: string;
  brand_id: string | null;
}

// Pull the human-readable message and code out of a failed edge function call.
async function readFunctionError(error: unknown): Promise<{ message: string; code: string | null }> {
  const fallback = { message: "Something went wrong. Please try again.", code: null };
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      return { message: body?.error || fallback.message, code: body?.code ?? null };
    } catch {
      return fallback;
    }
  }
  if (error instanceof Error && error.message) return { message: error.message, code: null };
  return fallback;
}

export default function Landing() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const [activeTab, setActiveTab] = useState<"creator" | "admin">("creator");
  const [isSignUp, setIsSignUp] = useState(!!inviteToken);
  const [isLoading, setIsLoading] = useState(false);
  const [validatingInvite, setValidatingInvite] = useState(!!inviteToken);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [needsSetup, setNeedsSetup] = useState(false);


  const navigate = useNavigate();
  const { toast } = useToast();

  // Force dark mode on sign-in page, restore previous theme on leave
  useEffect(() => {
    const wasDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.add("dark");
    return () => {
      if (!wasDark) {
        document.documentElement.classList.remove("dark");
      }
    };
  }, []);

  // Supabase sends expired or already-used email links back here with
  // #error=access_denied&error_code=otp_expired&error_description=... Say so instead of
  // dropping the person on the login form with no explanation.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("error")) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const code = params.get("error_code");
    const description = params.get("error_description");
    if (!params.get("error") && !code) return;
    toast({
      title: code === "otp_expired" ? "That link has expired" : "That link didn't work",
      description: description || "Sign in with your password, or use Forgot password to get a fresh link.",
      variant: "destructive",
    });
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [toast]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // On the invite path handleSubmit does the redirect itself after provisioning.
        if (event === 'SIGNED_IN' && session && !inviteToken) {
          redirectBasedOnRole(session.user.id);
        }
        if (event === 'SIGNED_OUT' && !inviteToken) {
          setEmail("");
          setPassword("");
          setFullName("");
        }
      }
    );

    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      if (inviteToken) {
        // An invite link is a fresh start. Drop any leftover session on this device so the
        // invited person signs up as themselves rather than landing in someone else's account.
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // already gone
        }
        return;
      }
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user && !error) {
        redirectBasedOnRole(user.id);
      } else {
        try {
          await supabase.auth.signOut();
        } catch {
          // already gone
        }
      }
    }, 100);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [inviteToken]);

  // First-run detection: if the platform has no admin yet, show setup on the admin tab
  useEffect(() => {
    if (inviteToken) return;
    supabase.functions
      .invoke("owner-bootstrap", { body: { action: "status" } })
      .then(({ data }) => setNeedsSetup(!!data?.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, [inviteToken]);




  useEffect(() => {
    if (inviteToken) {
      validateInvite(inviteToken);
    }
  }, [inviteToken]);


  // Token-scoped RPC. The browser no longer reads public.invites directly, so one invite
  // token can no longer be used to list every other pending invite.
  async function validateInvite(token: string) {
    setValidatingInvite(true);
    try {
      // Plain array read rather than maybeSingle(): an unknown token returns zero rows, and
      // the object-shaped Accept header turns that into a 406 in the browser console.
      const { data, error } = await supabase.rpc("validate_invite", { _token: token });
      const row = data?.[0];

      if (error || !row) {
        setInviteError("This invite link is invalid or has expired.");
        return;
      }

      setInviteData(row as InviteData);
      setEmail(row.email);
      setActiveTab(row.role);
    } catch {
      setInviteError("Failed to validate invite link.");
    } finally {
      setValidatingInvite(false);
    }
  }

  async function redirectBasedOnRole(userId: string) {
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleData?.role === "admin") {
      navigate("/admin");
    } else {
      navigate("/creator");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      const validation = authSchema.safeParse({
        email,
        password,
        fullName: isSignUp ? fullName : undefined,
      });

      if (!validation.success) {
        const fieldErrors: Record<string, string> = {};
        validation.error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
        setIsLoading(false);
        return;
      }

      if (isSignUp) {
        if (!inviteData || !inviteToken) {
          toast({
            title: "Invite required",
            description: "You need an invite link to sign up for this platform.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        // Provision server-side. The function creates the auth user already confirmed, writes
        // the profile, role and brand assignment, and marks the invite used. Nothing here
        // depends on the browser being authenticated, which is what broke the old flow.
        const { error: acceptError } = await supabase.functions.invoke("accept-invite", {
          body: { token: inviteToken, password, full_name: fullName.trim() },
        });

        if (acceptError) {
          const { message, code } = await readFunctionError(acceptError);
          if (code === "account_exists") {
            toast({ title: "Account exists", description: message, variant: "destructive" });
            setIsSignUp(false);
          } else if (code === "invalid_invite") {
            setInviteError(message);
          } else if (code === "weak_password") {
            setErrors({ password: message });
          } else {
            toast({ title: "Couldn't create your account", description: message, variant: "destructive" });
          }
          setIsLoading(false);
          return;
        }

        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: inviteData.email,
          password,
        });

        if (signInError || !data.user) {
          toast({
            title: "Account created",
            description: "Your account is ready. Sign in with the password you just chose.",
          });
          setIsSignUp(false);
          setIsLoading(false);
          return;
        }

        toast({
          title: "Account created!",
          description: "Welcome! Redirecting to your dashboard...",
        });

        await redirectBasedOnRole(data.user.id);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.code === "email_not_confirmed" || error.message.includes("Email not confirmed")) {
            // Only legacy accounts can hit this now; new signups are created confirmed.
            try {
              await supabase.auth.resend({
                type: "signup",
                email,
                options: { emailRedirectTo: `${window.location.origin}/` },
              });
            } catch {
              // rate limited or already confirmed; the message below still applies
            }
            toast({
              title: "Confirm your email first",
              description: "We just sent you a fresh confirmation link. Open it, then sign in again. Or use Forgot password below.",
              variant: "destructive",
            });
          } else if (error.code === "invalid_credentials" || error.message.includes("Invalid login credentials")) {
            toast({
              title: "Invalid credentials",
              description: "Please check your email and password and try again.",
              variant: "destructive",
            });
          } else {
            throw error;
          }
          setIsLoading(false);
          return;
        }

        if (data.user) {
          await redirectBasedOnRole(data.user.id);
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
      toast({
        title: "Error",
        description: error instanceof Error && error.message ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (validatingInvite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Validating invite...</p>
        </div>
      </div>
    );
  }

  if (inviteToken && inviteError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">Invalid Invite</h1>
          <p className="text-muted-foreground mb-6">{inviteError}</p>
          <Button variant="outline" asChild>
            <Link to="/">Go Back</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-background">
      {/* Ambient gradient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary opacity-[0.08] blur-[120px] animate-float" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-accent opacity-[0.06] blur-[100px] animate-float" style={{ animationDelay: "-3s" }} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-primary opacity-[0.04] blur-[80px] animate-float" style={{ animationDelay: "-1.5s" }} />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src={logo} alt="Creators Control" className="w-12 h-12 rounded-2xl shadow-glow-md" />
          <span className="font-semibold text-2xl text-foreground">Creators Control</span>
        </div>

        {/* Tab Switcher */}
        {!isSignUp && (
          <div className="flex mb-6 bg-muted/60 backdrop-blur-xl rounded-xl p-1 border border-border/50">
            <button
              onClick={() => setActiveTab("creator")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all duration-300 ${
                activeTab === "creator"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-4 h-4" />
              Creator
            </button>
            <button
              onClick={() => setActiveTab("admin")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all duration-300 ${
                activeTab === "admin"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Shield className="w-4 h-4" />
              Admin
            </button>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-card/80 backdrop-blur-2xl border border-border/50 rounded-2xl p-6 shadow-2xl">
          <h1 className="text-xl font-semibold mb-1 text-center text-foreground">
            {isSignUp
              ? `Create ${inviteData?.role === "admin" ? "Admin" : "Creator"} Account`
              : `${activeTab === "admin" ? "Admin" : "Creator"} Login`}
          </h1>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            {isSignUp
              ? "Complete your registration below"
              : "Sign in to access your dashboard"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={errors.fullName ? "border-destructive" : ""}
                />
                {errors.fullName && (
                  <p className="text-sm text-destructive">{errors.fullName}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={errors.email ? "border-destructive" : ""}
                disabled={isSignUp && !!inviteData}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={errors.password ? "border-destructive" : ""}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-purple hover:opacity-90 shadow-glow-sm text-white"
              disabled={isLoading || (isSignUp && !inviteData)}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isSignUp ? "Create Account" : "Sign In"}
            </Button>

            {!isSignUp && (
              <div className="text-center">
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot your password?
                </Link>
              </div>
            )}
          </form>

        {isSignUp && (
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  onClick={() => setIsSignUp(false)}
                  className="text-primary hover:underline font-medium"
                >
                  Sign in
                </button>
              </p>
              <p className="text-xs text-muted-foreground/70 mt-3">
                By creating an account, you agree to our{" "}
                <Link to="/terms" className="text-primary hover:underline">Terms</Link>
                {" "}and{" "}
                <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              </p>
            </div>
          )}
        </div>

        {activeTab === "admin" && needsSetup ? (
          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
            <p className="text-sm text-foreground font-medium mb-1">First time here?</p>
            <p className="text-xs text-muted-foreground mb-3">
              No owner account exists yet. Set up your brand and admin login to get started.
            </p>
            <Button asChild size="sm" className="bg-gradient-purple hover:opacity-90 text-white">
              <Link to="/setup">Start setup</Link>
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/50 text-center mt-6">
            Need an account? Contact your admin for an invite link.
          </p>
        )}
      </div>
    </div>
  );
}
