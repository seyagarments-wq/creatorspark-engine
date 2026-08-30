import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Shield } from "lucide-react";
import { z } from "zod";
import { notifyAdminsOfNewCreator } from "@/lib/notifications";
import logo from "@/assets/logo.png";

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
  brand_id?: string;
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");
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

  useEffect(() => {
    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        redirectBasedOnRole(session.user.id);
      }
    });
  }, []);

  useEffect(() => {
    // Validate invite token if present
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
    } else if (roleData?.role === "creator") {
      navigate("/creator");
    } else {
      navigate("/creator");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      // Validate input
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
        // Require invite for signup
        if (!inviteData) {
          toast({
            title: "Invite required",
            description: "You need an invite link to sign up for this platform.",
            variant: "destructive",
          });
          return;
        }

        // Sign up with invite
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
          return;
        }

        if (data.user) {
          // Create profile and role
          const { error: profileError } = await supabase.from("profiles").insert({
            user_id: data.user.id,
            full_name: fullName,
            email: inviteData.email,
          });

          if (profileError) {
            console.error("Profile creation error:", profileError);
          }

          // Assign role from invite
          const { error: roleError } = await supabase.from("user_roles").insert({
            user_id: data.user.id,
            role: inviteData.role,
          });

          if (roleError) {
            console.error("Role assignment error:", roleError);
          }

          // Mark invite as used
          await supabase
            .from("invites")
            .update({ used_at: new Date().toISOString() })
            .eq("id", inviteData.id);

          // Get brand name for notification
          let brandName: string | undefined;
          if (inviteData.brand_id) {
            const { data: brand } = await supabase
              .from("brands")
              .select("name")
              .eq("id", inviteData.brand_id)
              .single();
            brandName = brand?.name;
          }

          // Notify admins about the new creator
          notifyAdminsOfNewCreator({
            creatorName: fullName,
            creatorEmail: inviteData.email,
            brandName,
          });

          toast({
            title: "Account created!",
            description: "Welcome to CreatorHub. Redirecting to your dashboard...",
          });

          navigate("/creator");
        }
      } else {
        // Sign in
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

  // Show loading while validating invite
  if (validatingInvite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-accent" />
          <p className="text-muted-foreground">Validating invite...</p>
        </div>
      </div>
    );
  }

  // Show error if invite is invalid
  if (inviteToken && inviteError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Invalid Invite</h1>
          <p className="text-muted-foreground mb-6">{inviteError}</p>
          <Button variant="outline" asChild>
            <Link to="/">Go to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <div className="flex items-center gap-3 mb-8">
            <img src={logo} alt="Creatorsctrl" width={40} height={40} className="w-10 h-10 rounded-xl shadow-glow-sm" />
            <span className="font-semibold text-xl">Creatorsctrl</span>
          </div>

          <h1 className="text-2xl font-bold mb-2">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-muted-foreground mb-8">
            {isSignUp 
              ? inviteData 
                ? `You've been invited to join as a ${inviteData.role}`
                : "Sign up requires an invite link"
              : "Sign in to access your dashboard"
            }
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
              className="w-full" 
              variant="success"
              disabled={isLoading || (isSignUp && !inviteData)}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isSignUp ? "Create Account" : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            {isSignUp ? (
              <p className="text-muted-foreground">
                Already have an account?{" "}
                <button
                  onClick={() => setIsSignUp(false)}
                  className="text-accent hover:underline font-medium"
                >
                  Sign in
                </button>
              </p>
            ) : (
              <p className="text-muted-foreground">
                Need an account? Contact your admin for an invite link.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right side - Decorative */}
      <div className="hidden lg:flex flex-1 bg-gradient-hero items-center justify-center p-12">
        <div className="max-w-md text-primary-foreground">
          <h2 className="text-3xl font-bold mb-4">
            Turn Your Content Into Revenue
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            Upload videos, track performance, and get paid based on results. 
            Join thousands of creators earning from their UGC content.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Creators", value: "500+" },
              { label: "Avg. Earnings", value: "$2,500/mo" },
            ].map((stat, i) => (
              <div key={i} className="bg-primary-foreground/10 rounded-lg p-4">
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-sm text-primary-foreground/70">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
