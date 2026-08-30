import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Zap, Loader2, Users, Shield } from "lucide-react";
import { z } from "zod";


const authSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(2, "Name must be at least 2 characters").optional(),
});

interface InviteData {
  id: string;
  email: string;
  token: string;
  role: "admin" | "creator";
  expires_at: string;
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          redirectBasedOnRole(session.user.id);
        }
        if (event === 'SIGNED_OUT') {
          setEmail("");
          setPassword("");
          setFullName("");
        }
      }
    );

    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (user && !error) {
          redirectBasedOnRole(user.id);
        } else {
          try {
            await supabase.auth.signOut();
          } catch {
          }
        }
      }
    }, 100);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (inviteToken) {
      validateInvite(inviteToken);
    }
  }, [inviteToken]);

  async function validateInvite(token: string) {
    setValidatingInvite(true);
    try {
      const { data, error } = await supabase
        .from("invites")
        .select("*")
        .eq("token", token)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error || !data) {
        setInviteError("This invite link is invalid or has expired.");
        return;
      }

      setInviteData(data as InviteData);
      setEmail(data.email);
      setActiveTab(data.role);
    } catch (error) {
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
        if (!inviteData) {
          toast({
            title: "Invite required",
            description: "You need an invite link to sign up for this platform.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        const redirectUrl = `${window.location.origin}/`;
        const { data, error } = await supabase.auth.signUp({
          email: inviteData.email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            toast({
              title: "Account exists",
              description: "This email is already registered. Please sign in instead.",
              variant: "destructive",
            });
            setIsSignUp(false);
          } else {
            throw error;
          }
          setIsLoading(false);
          return;
        }

        if (data.user) {
          const { error: profileError } = await supabase.from("profiles").insert({
            user_id: data.user.id,
            full_name: fullName,
            email: inviteData.email,
          });

          if (profileError) {
            console.error("Profile creation error:", profileError);
          }

          const { error: roleError } = await supabase.from("user_roles").insert({
            user_id: data.user.id,
            role: inviteData.role,
          });

          if (roleError) {
            console.error("Role assignment error:", roleError);
          }

          await supabase
            .from("invites")
            .update({ used_at: new Date().toISOString() })
            .eq("id", inviteData.id);

          toast({
            title: "Account created!",
            description: "Welcome! Redirecting to your dashboard...",
          });

          if (inviteData.role === "admin") {
            navigate("/admin");
          } else {
            navigate("/creator");
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
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
    } catch (error: any) {
      console.error("Auth error:", error);
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
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
          <div className="w-12 h-12 rounded-2xl bg-gradient-purple flex items-center justify-center shadow-glow-md">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <span className="font-semibold text-2xl text-foreground">Creatorsctrl</span>
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

        <p className="text-xs text-muted-foreground/50 text-center mt-6">
          Need an account? Contact your admin for an invite link.
        </p>
      </div>
    </div>
  );
}
