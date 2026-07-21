import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth, useUser } from "@clerk/tanstack-react-start";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, Copy, CreditCard, Crown, Loader2, Sparkles, Calendar, ShieldCheck, AlertCircle, RefreshCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import Sentry from "@/lib/sentry";

import { useSubscriptionStatus, useBillingPlans, useBillingHistory } from "@/lib/queries";

export const Route = createFileRoute("/dashboard/billing")({
  component: BillingPage,
});

type SubscriptionStatus = {
  is_pro: boolean;
  plan: "free" | "pro";
  subscription?: {
    id?: string;
    product_id?: string;
    status?: string;
    expires_at?: string;
    platform?: string;
    auto_renewing?: boolean;
  } | null;
};

const FEATURES = [
  "Unlimited AI flashcards",
  "PDF, notes, and YouTube generation",
  "Priority processing queue",
  "Access across web and mobile",
];

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function getPlanDisplayName(productId?: string | null): string {
  if (!productId) return "Pro";
  if (productId.includes("yearly") || productId.includes("year")) {
    return "Annual Pro";
  }
  if (productId.includes("monthly")) {
    return "Monthly Pro";
  }
  if (productId.includes("weekly")) {
    return "Weekly Pro";
  }
  return "Pro";
}

function BillingPage() {
  const { getToken } = useAuth();
  const { user } = useUser();

  const statusQuery = useSubscriptionStatus();
  const plansQuery = useBillingPlans();
  const historyQuery = useBillingHistory();

  const status = statusQuery.data;
  const plans = plansQuery.data;
  const loading = statusQuery.isLoading || plansQuery.isLoading;

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getStatusBadgeStyle = (statusStr: string) => {
    switch (statusStr.toLowerCase()) {
      case "active":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "cancelled":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "expired":
        return "bg-rose-500/10 text-rose-600 border-rose-500/20";
      case "in_grace_period":
      case "grace_period":
        return "bg-sky-500/10 text-sky-600 border-sky-500/20";
      case "pending":
        return "bg-zinc-500/10 text-zinc-600 border-zinc-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const formatStatus = (statusStr: string) => {
    const s = statusStr.toLowerCase();
    if (s === "in_grace_period" || s === "grace_period") {
      return "Grace Period";
    }
    return statusStr.replace(/_/g, " ");
  };

  const history = historyQuery.data?.history
    ? [...historyQuery.data.history].sort(
        (a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime()
      )
    : [];

  const fetchStatus = async () => {
    await statusQuery.refetch();
  };

  const handleCheckout = async (plan: "weekly" | "monthly" | "yearly") => {
    setCheckoutLoading(true);
    try {
      // Step 1: Create a Razorpay subscription via backend.
      const subscription = await apiFetch<any>("/billing/web/create-subscription", {
        method: "POST",
        getToken,
        bodyJson: { plan },
      });

      // Step 2: Load Razorpay checkout script
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error("Failed to load payment gateway. Please try again.");
        setCheckoutLoading(false);
        return;
      }

      // Step 3: Open Razorpay modal for subscription checkout.
      const options = {
        key: subscription.key_id,
        name: "PikaDecks",
        description: subscription.description,
        subscription_id: subscription.subscription_id,
        handler: async function (response: any) {
          setCheckoutLoading(false);
          setStatusMessage("Processing Subscription...");
          // Step 4: Verify subscription checkout on backend.
          try {
            const result = await apiFetch<any>("/billing/web/verify-subscription", {
              method: "POST",
              getToken,
              bodyJson: {
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan,
              },
            });

            if (result.success) {
              // Poll for active premium status
              let attempts = 0;
              const maxAttempts = 6;
              const checkStatus = async () => {
                try {
                  const data = await apiFetch<{ is_pro: boolean }>("/billing/subscription-status", { method: "POST", getToken });
                  if (data.is_pro || attempts >= maxAttempts) {
                    await fetchStatus();
                    setStatusMessage("Subscription Active");
                    setTimeout(() => setStatusMessage(null), 3000);
                  } else {
                    attempts++;
                    setTimeout(checkStatus, 2000);
                  }
                } catch (err: any) {
                  attempts++;
                  if (attempts >= maxAttempts) {
                    Sentry.captureException(err, {
                      tags: {
                        user_id: user?.id,
                        subscription_id: response.razorpay_subscription_id,
                        payment_id: response.razorpay_payment_id,
                        phase: "polling_error",
                      }
                    });
                    await fetchStatus();
                    setStatusMessage(null);
                  } else {
                    setTimeout(checkStatus, 2000);
                  }
                }
              };
              await checkStatus();
            } else {
              Sentry.captureMessage("Payment verification returned success=false", {
                level: "error",
                tags: {
                  user_id: user?.id,
                  subscription_id: response.razorpay_subscription_id,
                  payment_id: response.razorpay_payment_id,
                }
              });
              toast.error("Payment verification failed. Please contact support.");
              setStatusMessage(null);
            }
          } catch (err: any) {
            Sentry.captureException(err, {
              tags: {
                user_id: user?.id,
                subscription_id: response.razorpay_subscription_id,
                payment_id: response.razorpay_payment_id,
                phase: "verification_error",
              }
            });
            toast.error("Payment verification failed. Please contact support.");
            setStatusMessage(null);
          }
        },
        modal: {
          ondismiss: function () {
            setCheckoutLoading(false);
          },
        },
        theme: {
          color: "#6366f1",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        Sentry.captureMessage("Razorpay payment failed modal callback", {
          level: "warning",
          tags: {
            user_id: user?.id,
            error_code: response?.error?.code,
          },
          extra: {
            error: response?.error,
          }
        });
        toast.error(response?.error?.description || "Payment failed. Please try again.");
        setCheckoutLoading(false);
      });
      rzp.open();
    } catch (e: any) {
      Sentry.captureException(e, {
        tags: { user_id: user?.id }
      });
      toast.error("Failed to initialize checkout. Please try again.");
      setCheckoutLoading(false);
    }
  };


  const sub = status?.subscription;
  const isPro = !!status?.is_pro;
  const isAutoRenewing = !!sub?.auto_renewing;
  const isCancelledButActive = isPro && !isAutoRenewing;
  const isActiveAutoRenew = isPro && isAutoRenewing;
  const isExpired = !isPro && !!sub;

  const getPlanKey = (productId?: string | null): "weekly" | "monthly" | "yearly" => {
    if (!productId) return "monthly";
    const id = productId.toLowerCase();
    if (id.includes("yearly") || id.includes("year")) return "yearly";
    if (id.includes("weekly") || id.includes("week")) return "weekly";
    return "monthly";
  };

  const showPlans = !isPro || isCancelledButActive;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 pb-24 font-sans sm:px-6 relative">
      {statusMessage && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-[2.5rem] p-8 text-center max-w-sm w-full space-y-4 shadow-xl animate-scale-up">
            <div className="flex justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
            <h3 className="font-display text-xl font-extrabold text-foreground">{statusMessage}</h3>
            <p className="text-xs font-semibold text-muted-foreground leading-relaxed">
              Please do not close this window. We are updating your premium status in real-time.
            </p>
          </div>
        </div>
      )}
      <Link
        to="/dashboard/profile"
        className="inline-flex items-center gap-2 text-xs font-extrabold text-muted-foreground transition hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to profile
      </Link>
      {isPro ? (
        <div className="space-y-8 max-w-2xl mx-auto animate-fade-in text-left">
          {/* Detailed Current Subscription Card */}
          <section className="rounded-3xl border border-border bg-card p-6 space-y-6">
            <div className="flex flex-col sm:flex-row gap-5 sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-brand-soft text-primary">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary">Your Pro Subscription</p>
                  <h2 className="mt-1 text-xl font-extrabold text-foreground">
                    PikaDecks Pro
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">
                    You have full access to all PikaDecks Pro features.
                  </p>
                </div>
              </div>
              
              <div className="shrink-0">
                {sub?.platform === "android" ? (
                  <a
                    href="https://play.google.com/store/account/subscriptions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-brand-ink px-5 py-2.5 text-xs font-extrabold transition-all hover:scale-[0.99] active:scale-[0.97]"
                  >
                    <CreditCard className="h-4 w-4" />
                    Manage Subscription
                  </a>
                ) : (
                  <a
                    href="https://pikadecks.app/support"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-brand-ink px-5 py-2.5 text-xs font-extrabold transition-all hover:scale-[0.99] active:scale-[0.97]"
                  >
                    <CreditCard className="h-4 w-4" />
                    Manage Subscription
                  </a>
                )}
              </div>
            </div>

            {/* Cancelled Warning */}
            {sub?.status === "cancelled" && sub?.expires_at && (
              <div className="bg-amber-500/10 border border-amber-200 text-amber-800 p-4 rounded-2xl text-xs font-bold leading-relaxed flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Your Pro membership remains active until {formatDate(sub.expires_at)}.</span>
              </div>
            )}

            {/* Grace Period Warning */}
            {(sub?.status === "grace_period" || sub?.status === "in_grace_period") && (
              <div className="bg-rose-500/10 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs font-bold leading-relaxed flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>There was a problem renewing your subscription. Please update your payment method to avoid losing access.</span>
              </div>
            )}

            <div className="pt-4 border-t border-border/60 grid gap-4 grid-cols-2 sm:grid-cols-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Status</span>
                <p className={`mt-0.5 text-sm font-extrabold capitalize ${sub?.status === "active" ? "text-emerald-600" : sub?.status === "cancelled" ? "text-amber-600" : "text-rose-600"}`}>
                  {formatStatus(sub?.status || "Active")}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Billing Period</span>
                <p className="mt-0.5 text-sm font-extrabold text-foreground">
                  {sub?.product_id === "pikadecks_yearly_pack" ? "Yearly" : "Monthly"}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Platform</span>
                <p className="mt-0.5 text-sm font-extrabold text-foreground capitalize">
                  {sub?.platform || "Web"}
                </p>
              </div>
              {sub?.auto_renewing ? (
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Renews on</span>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground">
                    {formatDate(sub?.expires_at)}
                  </p>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Expires on</span>
                  <p className="mt-0.5 text-sm font-extrabold text-rose-600">
                    {formatDate(sub?.expires_at)}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Subscription History Section */}
          <div className="space-y-6 pt-6 border-t border-border/60">
            <h2 className="font-display text-2xl font-extrabold text-foreground">Subscription History</h2>
            {historyQuery.isLoading ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-bold text-muted-foreground">Loading subscription history...</p>
              </div>
            ) : historyQuery.isError ? (
              <div className="text-center p-8 border border-rose-500/20 rounded-3xl bg-rose-50/5 space-y-4">
                <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
                <h3 className="text-sm font-bold text-foreground">Failed to load history</h3>
                <p className="text-xs font-semibold text-muted-foreground max-w-sm mx-auto">
                  We encountered an error while fetching your subscription history. Please try again.
                </p>
                <button
                  onClick={() => void historyQuery.refetch()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-background border border-border rounded-xl hover:bg-muted transition-colors"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center p-8 border border-dashed border-border/80 rounded-3xl bg-card">
                <CreditCard className="mx-auto h-10 w-10 text-muted-foreground/60 mb-2" />
                <h3 className="text-sm font-bold text-foreground">No subscription history found.</h3>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  You don't have any subscription or billing orders on this account yet.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {history.map((item: any) => {
                  const txId = item.transaction_id || item.id;
                  const isAutoRenewingItem = !!item.auto_renewing;

                  return (
                    <div
                      key={item.id}
                      className="rounded-3xl border border-border bg-card p-6 shadow-sm hover:border-primary/20 transition-all space-y-4 text-left"
                    >
                      {/* Card Header: Plan, Status, Amount */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-border/60">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-extrabold text-foreground">{item.plan_name}</h3>
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-extrabold uppercase ${getStatusBadgeStyle(
                                item.status
                              )}`}
                            >
                              {formatStatus(item.status)}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-muted-foreground mt-1">
                            Payment via {item.provider === "google_play" ? "Google Play" : "Razorpay"}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-2xl font-black text-foreground">₹{item.amount}</span>
                        </div>
                      </div>

                      {/* Card Body: Info Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-3">
                          <div>
                            <span className="font-extrabold uppercase tracking-wider text-muted-foreground text-[10px]">
                              Purchase Date
                            </span>
                            <div className="flex items-center gap-2 mt-1 text-foreground font-bold">
                              <Calendar className="h-4 w-4 text-muted-foreground/60" />
                              <span>{formatDate(item.purchase_date)}</span>
                            </div>
                          </div>

                          <div>
                            <span className="font-extrabold uppercase tracking-wider text-muted-foreground text-[10px]">
                              Renewal Date
                            </span>
                            <div className="flex items-center gap-2 mt-1 text-foreground font-bold">
                              <Calendar className="h-4 w-4 text-muted-foreground/60" />
                              <span>{isAutoRenewingItem ? formatDate(item.expiry_date) : "N/A"}</span>
                            </div>
                          </div>

                          <div>
                            <span className="font-extrabold uppercase tracking-wider text-muted-foreground text-[10px]">
                              Expiry Date
                            </span>
                            <div className="flex items-center gap-2 mt-1 text-foreground font-bold">
                              <Calendar className="h-4 w-4 text-muted-foreground/60" />
                              <span>{!isAutoRenewingItem ? formatDate(item.expiry_date) : "N/A"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <span className="font-extrabold uppercase tracking-wider text-muted-foreground text-[10px]">
                              Auto Renew Status
                            </span>
                            <div className="flex items-center gap-2 mt-1 text-foreground font-bold">
                              <RefreshCcw className={`h-4 w-4 ${isAutoRenewingItem ? "text-emerald-500" : "text-muted-foreground/60"}`} />
                              <span className={isAutoRenewingItem ? "text-emerald-600 font-extrabold" : "text-muted-foreground"}>
                                {isAutoRenewingItem ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                          </div>

                          <div>
                            <span className="font-extrabold uppercase tracking-wider text-muted-foreground text-[10px]">
                              Transaction ID
                            </span>
                            <div className="flex items-center gap-2 bg-background border border-border/85 rounded-2xl px-3 py-1.5 min-w-0 mt-1 max-w-full">
                              <span className="font-mono font-semibold text-foreground truncate select-all">
                                {txId}
                              </span>
                              {txId && (
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(txId);
                                    toast.success("Transaction ID copied to clipboard!");
                                    setCopiedId(item.id);
                                    setTimeout(() => setCopiedId(null), 2000);
                                  }}
                                  className="p-1 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                  title="Copy Transaction ID"
                                >
                                  {copiedId === item.id ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          <div>
                            <span className="font-extrabold uppercase tracking-wider text-muted-foreground text-[10px]">
                              Verification Status
                            </span>
                            <div className="flex items-center gap-1.5 font-bold text-foreground mt-1">
                              <ShieldCheck className="h-4 w-4 text-emerald-500" />
                              <span>Verified Order</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {isActiveAutoRenew && (
            <section className="rounded-[2rem] border border-emerald-200/80 bg-emerald-50/10 dark:bg-emerald-950/10 p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  Active Subscription Details
                </h2>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Auto-Renew On
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Plan</span>
                  <p className="text-base font-extrabold text-foreground mt-1">
                    {getPlanDisplayName(sub?.product_id)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Next Renewal Date</span>
                  <p className="text-base font-extrabold text-foreground mt-1">
                    {sub?.expires_at
                      ? new Date(sub.expires_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "Active"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Platform</span>
                  <p className="text-base font-extrabold text-foreground mt-1 capitalize">
                    {sub?.platform || "Web"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Payment Gateway</span>
                  <p className="text-base font-extrabold text-foreground mt-1 capitalize">
                    Razorpay
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-border/60">
                <p className="text-xs font-semibold text-muted-foreground leading-relaxed">
                  Your subscription auto-renews automatically. If you wish to cancel or modify your subscription, please contact us at{" "}
                  <a href="mailto:support@pikadecks.com" className="text-primary hover:underline font-bold">
                    support@pikadecks.com
                  </a>{" "}
                  with your subscription ID:{" "}
                  <code
                    onClick={() => {
                      if (sub?.id) {
                        navigator.clipboard.writeText(sub.id);
                        toast.success("Subscription ID copied to clipboard!");
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                    className="bg-muted hover:bg-muted/80 border border-border px-2 py-1 rounded font-mono text-[10px] cursor-pointer transition-colors inline-flex items-center gap-1.5 align-middle"
                    title="Click to copy"
                  >
                    {sub?.id || "N/A"}
                    {copied ? (
                      <Check className="h-3 w-3 text-emerald-500 animate-scale-up" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </code>
                </p>
              </div>
            </section>
          )}

          {isCancelledButActive && (
            <section className="rounded-[2rem] border border-amber-300 bg-amber-500/5 dark:bg-amber-500/5 p-6 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    Subscription Cancelled
                  </h2>
                  <p className="text-xs font-semibold text-muted-foreground mt-1">
                    Your Pro features remain active until your billing cycle ends.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-600">
                    Auto Renew: Off
                  </span>
                  <button
                    onClick={() => handleCheckout(getPlanKey(sub?.product_id))}
                    disabled={checkoutLoading}
                    className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground hover:bg-primary/95 transition-all shadow-sm disabled:opacity-60"
                  >
                    {checkoutLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                    Resubscribe Now
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Previous Plan</span>
                  <p className="text-base font-extrabold text-foreground mt-1">
                    {getPlanDisplayName(sub?.product_id)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Access Ends On</span>
                  <p className="text-base font-extrabold text-rose-600 mt-1">
                    {sub?.expires_at
                      ? new Date(sub.expires_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "N/A"}
                  </p>
                </div>
              </div>
              <p className="text-xs font-semibold text-muted-foreground">
                Want to switch to a different cycle? Select any plan below to initiate checkout.
              </p>
            </section>
          )}

          {isExpired && (
            <section className="rounded-[2rem] border border-rose-300 bg-rose-500/5 p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white font-bold">!</span>
                  Subscription Expired
                </h2>
                <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-600">
                  Expired
                </span>
              </div>
              <p className="text-sm font-semibold text-muted-foreground">
                Your PikaDecks Pro subscription ended on{" "}
                <span className="font-extrabold text-foreground">
                  {sub?.expires_at
                    ? new Date(sub.expires_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "N/A"}
                </span>
                . Upgrade to a plan below to unlock unlimited generations, priority queue, and all premium review modules immediately.
              </p>
            </section>
          )}

          {showPlans && (
            <section className="grid gap-4 md:grid-cols-3">
              <PlanCard
                title="Weekly Pro"
                price={plans?.weekly ? `₹${plans.weekly.amount}` : "₹49"}
                period="/wk"
                onSelect={() => handleCheckout("weekly")}
                loading={checkoutLoading}
                disabled={isActiveAutoRenew}
              />
              <PlanCard
                title="Monthly Pro"
                price={plans?.monthly ? `₹${plans.monthly.amount}` : "₹199"}
                period="/mo"
                onSelect={() => handleCheckout("monthly")}
                loading={checkoutLoading}
                disabled={isActiveAutoRenew}
              />
              <PlanCard
                title="Annual Pro"
                price={plans?.yearly ? `₹${plans.yearly.amount}` : "₹1999"}
                period="/yr"
                badge="Best value"
                selected
                onSelect={() => handleCheckout("yearly")}
                loading={checkoutLoading}
                disabled={isActiveAutoRenew}
              />
            </section>
          )}

          <section className="rounded-[2rem] border border-border bg-card p-6">
            <h2 className="text-lg font-extrabold text-foreground">Included with Pro</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <div key={feature} className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-bold text-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </section>

          {showPlans && (
            <section className="rounded-[2rem] border border-border bg-card p-6 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-primary" />
              <h2 className="mt-3 text-xl font-extrabold text-foreground">
                Ready to upgrade?
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-relaxed text-muted-foreground">
                Start a Razorpay subscription. It renews automatically until cancelled.
              </p>
              <button
                onClick={() => handleCheckout("monthly")}
                disabled={checkoutLoading || isActiveAutoRenew}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {isActiveAutoRenew ? "You are already Pro" : "Subscribe with Razorpay"}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PlanCard({
  badge,
  period,
  price,
  selected,
  title,
  onSelect,
  loading,
  disabled,
}: {
  badge?: string;
  period: string;
  price: string;
  selected?: boolean;
  title: string;
  onSelect?: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <article className={`relative rounded-[2rem] border bg-card p-6 ${selected ? "border-primary" : "border-border"}`}>
      {badge ? (
        <span className="absolute right-5 top-5 rounded-full bg-brand px-3 py-1 text-[10px] font-extrabold text-brand-foreground">
          {badge}
        </span>
      ) : null}
      <h2 className="text-lg font-extrabold text-foreground">{title}</h2>
      <p className="mt-4 text-3xl font-black text-foreground">
        {price}<span className="text-sm font-bold text-muted-foreground">{period}</span>
      </p>
      <p className="mt-2 text-xs font-semibold text-muted-foreground">
        {period === "/yr" ? "Auto-renewing yearly subscription." : period === "/wk" ? "Auto-renewing weekly subscription." : "Auto-renewing monthly subscription."}
      </p>
      <button
        onClick={onSelect}
        disabled={loading || disabled}
        className={`mt-6 w-full rounded-xl px-4 py-2 text-sm font-bold transition ${selected ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-foreground hover:bg-muted/80"} disabled:opacity-60`}
      >
        {disabled ? "You are Pro" : loading ? "Loading..." : "Select " + title}
      </button>
    </article>
  );
}
