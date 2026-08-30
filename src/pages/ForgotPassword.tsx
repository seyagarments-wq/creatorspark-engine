import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Zap, Loader2, CheckCircle, ArrowLeft, Mail } from "lucide-react";
import logo from "@/assets/logo.png";
import { z } from "zod";

const emailSchema = z.string().email("Please enter a valid email address");

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState("");
  
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const validation = emailSchema.safeParse(email);
      if (!validation.success) {
        setError(validation.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      const { error: fnError } = await supabase.functions.invoke("send-password-reset", {
        body: { email },
      });

      if (fnError) {
        throw fnError;
      }

      setEmailSent(true);
    } catch (error: any) {
      console.error("Password reset error:", error);
      // Still show success for security (don't reveal if email exists)
      setEmailSent(true);
    } finally {
      setIsLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <img src={logo} alt="Creatorsctrl" className="w-12 h-12 rounded-xl" />
            <span className="font-bold text-2xl">Creatorsctrl</span>
          </div>

          <div className="bg-card border rounded-xl p-8 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
              <Mail className="w-8 h-8 text-success" />
            </div>
            <h1 className="text-xl font-semibold mb-2">Check Your Email</h1>
            <p className="text-muted-foreground mb-6">
              If an account exists for <strong>{email}</strong>, we've sent a password reset link. Check your inbox and spam folder.
            </p>
            <div className="space-y-3">
              <Button variant="outline" className="w-full" onClick={() => setEmailSent(false)}>
                Try Another Email
              </Button>
              <Button variant="ghost" size="sm" asChild className="w-full">
                <Link to="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Login
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src={logo} alt="Creatorsctrl" className="w-12 h-12 rounded-xl" />
          <span className="font-bold text-2xl">Creatorsctrl</span>
        </div>

        {/* Form Card */}
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-1 text-center">
            Forgot Password?
          </h1>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            Enter your email and we'll send you a reset link
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={error ? "border-destructive" : ""}
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              variant="success"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Send Reset Link
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
