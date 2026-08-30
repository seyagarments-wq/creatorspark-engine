import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Zap, Loader2, CheckCircle, KeyRound, ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";
import { z } from "zod";

const passwordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Listen for auth state changes FIRST (recovery link click creates a session)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event, "Session:", !!session);
      
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setIsValidSession(true);
        setCheckingSession(false);
      } else if (event === "TOKEN_REFRESHED" && session) {
        setIsValidSession(true);
        setCheckingSession(false);
      }
    });

    // THEN check if we have a valid recovery session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log("Checking session:", !!session);
      
      // For password recovery, Supabase creates a session when user clicks the link
      if (session) {
        setIsValidSession(true);
      }
      setCheckingSession(false);
    };

    // Small delay to allow auth state to propagate from URL hash
    setTimeout(() => {
      checkSession();
    }, 100);

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      const validation = passwordSchema.safeParse({ password, confirmPassword });

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

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }

      setSuccess(true);
      toast({
        title: "Password updated!",
        description: "Your password has been successfully reset.",
      });

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (error: any) {
      console.error("Password reset error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-accent" />
          <p className="text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (!isValidSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <KeyRound className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Invalid or Expired Link</h1>
          <p className="text-muted-foreground mb-6">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Button asChild>
            <Link to="/forgot-password">Request New Reset Link</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Password Reset!</h1>
          <p className="text-muted-foreground mb-6">
            Your password has been successfully updated. Redirecting to login...
          </p>
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-accent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src={logo} alt="Creators Control" className="w-12 h-12 rounded-xl" />
          <span className="font-bold text-2xl">Creators Control</span>
        </div>

        {/* Form Card */}
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-1 text-center">
            Create New Password
          </h1>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            Enter your new password below
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={errors.confirmPassword ? "border-destructive" : ""}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              variant="success"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Reset Password
            </Button>
          </form>
        </div>

        <div className="text-center mt-6">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Login
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
