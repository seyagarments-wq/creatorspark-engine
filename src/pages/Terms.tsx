import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Zap, ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="Creatorsctrl" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-lg">Creatorsctrl</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: January 2025</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using the Creatorsctrl platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              Creatorsctrl is a UGC (User-Generated Content) creator management platform that connects content creators with brands for the purpose of creating promotional video content. The platform facilitates video submissions, performance tracking, and creator compensation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">3. Eligibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              You must be at least 18 years old and have the legal capacity to enter into a binding agreement to use the Service. Access to the platform is by invitation only.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">4. User Accounts</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You must provide accurate and complete information when creating your account.</li>
              <li>You are responsible for all activities that occur under your account.</li>
              <li>You must notify us immediately of any unauthorized use of your account.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">5. Content Guidelines</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When submitting content through the Service, you agree that:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>You own or have the necessary rights to the content you submit.</li>
              <li>Your content does not infringe on any third-party intellectual property rights.</li>
              <li>Your content complies with all applicable laws and regulations.</li>
              <li>Your content adheres to the brand guidelines provided for each campaign.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">6. Compensation</h2>
            <p className="text-muted-foreground leading-relaxed">
              Compensation for approved content is based on performance metrics and the commission rate assigned to your account. Payouts are processed monthly for creators who meet the minimum payout threshold. Payment is made via Stripe Connect to the bank account you provide.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">7. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              By submitting content through the Service, you grant the brand a non-exclusive, worldwide, royalty-free license to use, modify, and distribute your content for advertising and promotional purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">8. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to suspend or terminate your account at any time for violation of these Terms or for any other reason at our sole discretion. Upon termination, any pending approved payouts will still be processed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">9. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">10. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may modify these Terms at any time. Continued use of the Service after any changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">11. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms, please contact your account administrator.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
