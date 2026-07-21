import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useState } from "react";
import { ShieldAlert, Loader2, Trash2, Check, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/connected-apps")({
  component: ConnectedAppsPage,
});

interface OAuthGrant {
  id: string;
  client_id: string;
  scope: string;
  created_at: string;
  oauth_clients?: {
    client_name: string;
  };
}

function ConnectedAppsPage() {
  const { getToken } = useAuth();
  const [grants, setGrants] = useState<OAuthGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchGrants = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ success: boolean; grants: OAuthGrant[] }>("/oauth/grants", {
        method: "GET",
        getToken,
      });
      if (data.success) {
        setGrants(data.grants);
      }
    } catch (err: any) {
      console.error("Failed to load connected apps:", err);
      toast.error(err?.message || "Failed to load connected apps.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchGrants();
  }, []);

  const handleRevoke = async (grantId: string, clientName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${clientName}? This app will no longer be able to access your PikaDecks account.`)) {
      return;
    }

    setRevokingId(grantId);
    try {
      const data = await apiFetch<{ success: boolean }>(`/oauth/grants/${grantId}`, {
        method: "DELETE",
        getToken,
      });
      if (data.success) {
        toast.success(`Successfully disconnected ${clientName}`);
        setGrants((prev) => prev.filter((g) => g.id !== grantId));
      }
    } catch (err: any) {
      console.error("Failed to revoke grant:", err);
      toast.error(err?.message || "Failed to disconnect application.");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 pb-24 font-sans sm:px-6">
      <section className="border-b border-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-foreground">Connected Applications</h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Manage third-party integrations (like ChatGPT and Claude) authorized to access PikaDecks.
          </p>
        </div>
        <button
          onClick={() => void fetchGrants()}
          disabled={loading}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted transition disabled:opacity-50"
          aria-label="Refresh connected apps list"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </section>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : grants.length === 0 ? (
        <section className="rounded-3xl border border-border bg-card p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-foreground">No integrations connected</h3>
            <p className="text-xs font-semibold text-muted-foreground max-w-sm mx-auto">
              You haven't authorized any external applications (like ChatGPT GPTs or Claude tools) to access your decks yet.
            </p>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {grants.map((grant) => {
            const clientName = grant.oauth_clients?.client_name || grant.client_id;
            return (
              <div
                key={grant.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-border bg-card p-6 transition-all"
              >
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-foreground">{clientName}</h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground font-semibold">
                    <span>Authorized on: {new Date(grant.created_at).toLocaleDateString()}</span>
                    <span className="h-1 w-1 rounded-full bg-border hidden sm:inline" />
                    <span>Scopes: {grant.scope}</span>
                  </div>
                </div>

                <button
                  onClick={() => void handleRevoke(grant.id, clientName)}
                  disabled={revokingId === grant.id}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/50 px-4 py-2.5 text-xs font-extrabold text-rose-600 hover:bg-rose-100/50 disabled:opacity-50 transition-all"
                >
                  {revokingId === grant.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  )}
                  <span>Revoke Access</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
