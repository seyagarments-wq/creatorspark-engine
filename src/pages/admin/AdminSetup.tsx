import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, AlertCircle, Loader2, Save, PlugZap, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type SettingStatus = {
  key: string;
  configured: boolean;
  source: "environment" | "app" | null;
  preview: string | null;
  updated_at: string | null;
  editable: boolean;
};

type Field = {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  optional?: boolean;
};

type Integration = {
  id: string;
  name: string;
  description: string;
  testable?: boolean;
  docsUrl?: string;
  steps: string[];
  fields: Field[];
};

const INTEGRATIONS: Integration[] = [
  {
    id: "shopify",
    name: "Shopify",
    description: "Pull products into briefs and send free sample orders to creators.",
    testable: true,
    docsUrl: "https://admin.shopify.com/settings/apps/development",
    steps: [
      "In Shopify admin, go to Settings → Apps and sales channels → Develop apps.",
      "Create an app (name it anything, e.g. \"Creator Hub\"), then open Configuration → Admin API scopes.",
      "Enable read_products, write_orders, read_orders, read_customers and write_customers, then save.",
      "Open the API credentials tab and click Install app, then reveal the Admin API access token (starts with shpat_).",
      "Paste your store domain and that token below and press Save, then Test connection.",
      "The Client ID / Client secret fields are only needed if you use Shopify OAuth instead of the Admin token — leave them blank otherwise.",
    ],
    fields: [
      { key: "SHOPIFY_STORE_DOMAIN", label: "Store domain", placeholder: "your-store.myshopify.com" },
      { key: "SHOPIFY_ACCESS_TOKEN", label: "Admin API access token", placeholder: "shpat_..." },
      { key: "SHOPIFY_CLIENT_ID", label: "Client ID", optional: true },
      { key: "SHOPIFY_CLIENT_SECRET", label: "Client secret", optional: true },
    ],
  },

  {
    id: "resend",
    name: "Resend (email)",
    description: "Sends invites, reminders, digests and password resets.",
    testable: true,
    docsUrl: "https://resend.com/api-keys",
    steps: [
      "Create a free account at resend.com and add your sending domain under Domains.",
      "Add the DNS records Resend shows you at your domain registrar and wait for it to verify.",
      "Go to API Keys → Create API Key with Sending access.",
      "Paste the key below (starts with re_), save, then Test connection.",
    ],
    fields: [{ key: "RESEND_API_KEY", label: "Resend API key", placeholder: "re_..." }],
  },
  {
    id: "stripe",
    name: "Stripe (payouts)",
    description: "Creator Connect accounts, payouts and commission payments.",
    testable: true,
    docsUrl: "https://dashboard.stripe.com/apikeys",
    steps: [
      "In the Stripe dashboard, enable Connect (Express accounts) for your account.",
      "Go to Developers → API keys and reveal the Secret key (sk_live_... or sk_test_... while testing).",
      "Paste it below and save, then Test connection.",
    ],
    fields: [{ key: "STRIPE_SECRET_KEY", label: "Stripe secret key", placeholder: "sk_live_..." }],
  },
  {
    id: "meta",
    name: "Meta / Facebook Ads",
    description: "Ad insights, creative uploads and campaign launches.",
    testable: true,
    docsUrl: "https://developers.facebook.com/apps",
    steps: [
      "Create a Business app at developers.facebook.com and add the Marketing API product.",
      "Copy the App ID and App Secret from Settings → Basic.",
      "In Business Settings → Users → System users, create a system user with admin access to your ad account and generate a token with ads_management, ads_read, business_management.",
      "Copy your ad account ID from Ads Manager (format act_123456789).",
      "Paste everything below, save, then Test connection.",
    ],
    fields: [
      { key: "META_APP_ID", label: "App ID", placeholder: "1234567890" },
      { key: "META_APP_SECRET", label: "App secret" },
      { key: "META_SYSTEM_USER_TOKEN", label: "System user token" },
      { key: "META_AD_ACCOUNT_ID", label: "Ad account ID", placeholder: "act_1234567890" },
    ],
  },
  {
    id: "paypal",
    name: "PayPal (optional)",
    description: "Alternative payout method for commission payments.",
    docsUrl: "https://developer.paypal.com/dashboard/applications/live",
    steps: [
      "Open the PayPal developer dashboard and create a Live REST app.",
      "Copy the Client ID and Secret and paste them below.",
    ],
    fields: [
      { key: "PAYPAL_CLIENT_ID", label: "Client ID", optional: true },
      { key: "PAYPAL_CLIENT_SECRET", label: "Client secret", optional: true },
    ],
  },
  {
    id: "ai",
    name: "AI features (optional)",
    description: "Brief generation, hook analysis and the AI assistant.",
    steps: [
      "Add one key: OpenAI, Anthropic, or a Lovable AI Gateway key.",
      "Without a key, AI features stay disabled — everything else works fine.",
    ],
    fields: [
      { key: "OPENAI_API_KEY", label: "OpenAI API key", placeholder: "sk-...", optional: true },
      { key: "ANTHROPIC_API_KEY", label: "Anthropic API key", optional: true },
      { key: "LOVABLE_API_KEY", label: "Lovable AI Gateway key", optional: true },
    ],
  },
  {
    id: "app",
    name: "App URLs",
    description: "Used in emails and OAuth redirects. Set this to your live domain.",
    steps: [
      "Enter the public URL of this app, including https:// and no trailing slash.",
    ],
    fields: [
      { key: "APP_URL", label: "App URL", placeholder: "https://creators.yourdomain.com" },
      { key: "SITE_URL", label: "Site URL", placeholder: "https://creators.yourdomain.com", optional: true },
    ],
  },
];

export default function AdminSetup() {
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<SettingStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const statusMap = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.key, s])) as Record<string, SettingStatus>,
    [statuses],
  );

  const loadStatus = async () => {
    const { data, error } = await supabase.functions.invoke("platform-setup", {
      body: { action: "status" },
    });
    if (error) {
      toast.error("Could not load setup status");
    } else {
      setStatuses(data?.settings ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const saveIntegration = async (integration: Integration) => {
    const entries = integration.fields
      .filter((f) => drafts[f.key] !== undefined)
      .map((f) => ({ key: f.key, value: drafts[f.key] }));

    if (entries.length === 0) {
      toast.info("Nothing to save yet");
      return;
    }

    setSavingId(integration.id);
    const { data, error } = await supabase.functions.invoke("platform-setup", {
      body: { action: "save", entries },
    });
    setSavingId(null);

    if (error || data?.error) {
      toast.error(data?.error ?? "Could not save credentials");
      return;
    }
    setStatuses(data.settings ?? []);
    setDrafts((prev) => {
      const next = { ...prev };
      entries.forEach((e) => delete next[e.key]);
      return next;
    });
    toast.success(`${integration.name} saved`);
  };

  const testIntegration = async (integration: Integration) => {
    setTestingId(integration.id);
    const { data, error } = await supabase.functions.invoke("platform-setup", {
      body: { action: "test", service: integration.id },
    });
    setTestingId(null);

    if (error) {
      toast.error("Test failed to run");
      return;
    }
    if (data?.ok) toast.success(data.message);
    else toast.error(data?.message ?? "Connection failed");
  };

  const integrationState = (integration: Integration) => {
    const required = integration.fields.filter((f) => !f.optional);
    if (required.length === 0) {
      return integration.fields.some((f) => statusMap[f.key]?.configured) ? "connected" : "optional";
    }
    if (required.every((f) => statusMap[f.key]?.configured)) return "connected";
    if (required.some((f) => statusMap[f.key]?.configured)) return "partial";
    return "missing";
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <PlugZap className="h-7 w-7 text-primary" />
            Setup &amp; Integrations
          </h1>
          <p className="text-muted-foreground max-w-3xl">
            Connect the outside services this platform uses. Follow the steps in each section, paste
            your keys, save, and test — no developer needed.
          </p>
        </header>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex gap-3 pt-6 text-sm text-muted-foreground">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
            <p>
              Keys are stored encrypted at rest in your own database and are only ever read by
              server-side functions. They are never sent back to the browser — you only see a masked
              preview. Keys already set as server environment variables take priority and show as
              locked.
            </p>
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {INTEGRATIONS.map((integration) => {
              const state = integrationState(integration);
              return (
                <Card key={integration.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {integration.name}
                          {state === "connected" ? (
                            <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              <CheckCircle2 className="h-3 w-3" /> Connected
                            </Badge>
                          ) : state === "partial" ? (
                            <Badge variant="secondary" className="gap-1">
                              <AlertCircle className="h-3 w-3" /> Incomplete
                            </Badge>
                          ) : state === "optional" ? (
                            <Badge variant="outline">Optional</Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <AlertCircle className="h-3 w-3" /> Not set up
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription>{integration.description}</CardDescription>
                      </div>
                      {integration.docsUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={integration.docsUrl} target="_blank" rel="noreferrer">
                            Open dashboard <ExternalLink className="ml-1 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <Accordion type="single" collapsible>
                      <AccordionItem value="steps" className="border-b-0">
                        <AccordionTrigger className="py-2 text-sm">
                          How to get these credentials
                        </AccordionTrigger>
                        <AccordionContent>
                          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                            {integration.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    <Separator />

                    <div className="grid gap-4 sm:grid-cols-2">
                      {integration.fields.map((field) => {
                        const status = statusMap[field.key];
                        const locked = status?.editable === false;
                        return (
                          <div key={field.key} className="space-y-1.5">
                            <Label htmlFor={field.key} className="flex items-center gap-2">
                              {field.label}
                              {field.optional && (
                                <span className="text-xs text-muted-foreground">(optional)</span>
                              )}
                            </Label>
                            <Input
                              id={field.key}
                              type={field.key.includes("DOMAIN") || field.key.endsWith("URL") || field.key.endsWith("_ID") ? "text" : "password"}
                              autoComplete="off"
                              disabled={locked}
                              placeholder={
                                status?.configured
                                  ? `Saved · ${status.preview}`
                                  : field.placeholder ?? "Not set"
                              }
                              value={drafts[field.key] ?? ""}
                              onChange={(e) =>
                                setDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              {locked
                                ? "Set as a server environment variable — edit it in your hosting provider."
                                : status?.configured
                                  ? "Saved. Type a new value to replace it, or clear and save to remove."
                                  : field.help ?? "Not set yet."}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => saveIntegration(integration)}
                        disabled={savingId === integration.id}
                      >
                        {savingId === integration.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save
                      </Button>
                      {integration.testable && (
                        <Button
                          variant="outline"
                          onClick={() => testIntegration(integration)}
                          disabled={testingId === integration.id}
                        >
                          {testingId === integration.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <PlugZap className="mr-2 h-4 w-4" />
                          )}
                          Test connection
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
