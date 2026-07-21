import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { useState } from "react";
import { ChevronLeft, Loader2, Copy, Check, Calendar, CreditCard, ShieldCheck, AlertCircle, RefreshCcw } from "lucide-react";
import { useBillingHistory } from "@/lib/queries";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/billing/history")({
  component: SubscriptionHistoryPage,
});

function SubscriptionHistoryPage() {
  const { getToken } = useAuth();
  const historyQuery = useBillingHistory();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sort history: most recent purchase first
  const history = historyQuery.data?.history
    ? [...historyQuery.data.history].sort(
        (a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime()
      )
    : [];

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

  const getStatusBadgeStyle = (status: string) => {
    switch (status.toLowerCase()) {
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

  const formatStatus = (status: string) => {
    const s = status.toLowerCase();
    if (s === "in_grace_period" || s === "grace_period") {
      return "Grace Period";
    }
    return status.replace(/_/g, " ");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pb-24 font-sans sm:px-6">
      <section className="flex items-center gap-3 border-b border-border pb-4">
        <Link
          to="/dashboard/profile"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background hover:bg-muted text-foreground transition-all"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-display text-3xl font-extrabold text-foreground">Subscription History</h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            View all past orders, transaction IDs, and receipt history.
          </p>
        </div>
      </section>

      <div className="space-y-6">
        {historyQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center p-24 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold text-muted-foreground">Loading subscription history...</p>
          </div>
        ) : historyQuery.isError ? (
          <div className="text-center p-12 border border-rose-500/20 rounded-3xl bg-rose-50/5 space-y-4">
            <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
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
          <div className="text-center p-12 border border-dashed border-border/80 rounded-3xl bg-card">
            <CreditCard className="mx-auto h-12 w-12 text-muted-foreground/60 mb-3" />
            <h3 className="text-sm font-bold text-foreground">No subscription history found.</h3>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              You don't have any subscription or billing orders on this account yet.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {history.map((item: any) => {
              const txId = item.transaction_id || item.id;
              const isAutoRenewing = !!item.auto_renewing;

              return (
                <div
                  key={item.id}
                  className="rounded-3xl border border-border bg-card p-6 shadow-sm hover:border-primary/20 transition-all space-y-4"
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
                          <span>{isAutoRenewing ? formatDate(item.expiry_date) : "N/A"}</span>
                        </div>
                      </div>

                      <div>
                        <span className="font-extrabold uppercase tracking-wider text-muted-foreground text-[10px]">
                          Expiry Date
                        </span>
                        <div className="flex items-center gap-2 mt-1 text-foreground font-bold">
                          <Calendar className="h-4 w-4 text-muted-foreground/60" />
                          <span>{!isAutoRenewing ? formatDate(item.expiry_date) : "N/A"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="font-extrabold uppercase tracking-wider text-muted-foreground text-[10px]">
                          Auto Renew Status
                        </span>
                        <div className="flex items-center gap-2 mt-1 text-foreground font-bold">
                          <RefreshCcw className={`h-4 w-4 ${isAutoRenewing ? "text-emerald-500" : "text-muted-foreground/60"}`} />
                          <span className={isAutoRenewing ? "text-emerald-600 font-extrabold" : "text-muted-foreground"}>
                            {isAutoRenewing ? "Enabled" : "Disabled"}
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
  );
}
