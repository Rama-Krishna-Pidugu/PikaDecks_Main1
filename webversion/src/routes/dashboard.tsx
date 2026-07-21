import { createFileRoute, Outlet, Link, useRouter, useLocation } from "@tanstack/react-router";
import { useAuth, useUser, SignOutButton } from "@clerk/tanstack-react-start";
import { useState, useEffect } from "react";
import { LayoutDashboard, Layers, BarChart2, Plus, FileText, Edit3, Loader2, User, AlertCircle, Youtube, Crown } from "lucide-react";
import { useSyncUser, useSubscriptionStatus } from "@/lib/queries";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const { pathname } = useLocation();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // TanStack Query hooks — shared cache across all child routes
  const syncUserQuery = useSyncUser();
  const subscriptionQuery = useSubscriptionStatus();

  const isPro = subscriptionQuery.data?.is_pro || false;
  const backendReady = syncUserQuery.isSuccess;
  const syncError = syncUserQuery.isError ? (syncUserQuery.error?.message || "Please try again.") : null;

  // Handle account restoration alert
  useEffect(() => {
    if (syncUserQuery.data?.restored) {
      alert("Welcome back! Your account deletion request has been cancelled.");
    }
  }, [syncUserQuery.data?.restored]);

  // Redirect to /login if not signed in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      void router.navigate({ to: "/login" });
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (syncError) {
      void router.navigate({ to: "/login" });
    }
  }, [syncError, router]);

  // Loading / redirecting state
  if (!isLoaded || !isSignedIn || (!backendReady && !syncError)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-sm font-bold text-muted-foreground tracking-wider uppercase">Loading PikaDecks...</p>
      </div>
    );
  }

  if (syncError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground font-sans px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-rose-500 mb-4">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Please try again</h1>
        <p className="mt-2 max-w-sm text-sm font-semibold text-muted-foreground">
          We signed you in, but could not connect your account to PikaDecks yet.
        </p>
        <button
          onClick={() => void syncUserQuery.refetch()}
          className="btn-pop mt-6 inline-flex items-center justify-center rounded-xl bg-brand-yellow px-5 py-3 text-sm font-bold text-brand-ink"
        >
          Retry
        </button>
      </div>
    );
  }

  // Tab navigation structure
  const menuItems = [
    { to: "/dashboard", label: "Home", icon: LayoutDashboard },
    { to: "/dashboard/decks", label: "My Decks", icon: Layers },
    { to: "/dashboard/stats", label: "Stats", icon: BarChart2 },
    { to: "/dashboard/profile", label: "Profile", icon: User },
  ];

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground font-sans flex flex-col md:flex-row relative">

      {/* DESKTOP/TABLET SIDEBAR */}
      <aside className="hidden md:flex h-screen w-64 lg:w-72 shrink-0 flex-col bg-card/45 border-r border-border p-6 justify-start gap-8 relative overflow-hidden">
        {/* Logo */}
        <Link to="/dashboard" className="flex items-center gap-2.5 group shrink-0">
          <img src="/appIcon.png" alt="Pikadecks logo" className="h-8 w-8 rounded-lg transition-transform group-hover:rotate-[-4deg]" />
          <span className="font-display text-lg font-extrabold tracking-tight text-foreground">
            Pikadecks
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="space-y-2 flex-1 pr-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3.5 border rounded-2xl px-4 py-3 text-sm font-bold transition-all duration-200 cursor-pointer ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-transparent hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Create Deck button */}
          <button
            onClick={() => setCreateModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 btn-pop bg-brand-yellow text-brand-ink font-display font-extrabold py-3.5 rounded-2xl hover:scale-[0.99] active:scale-[0.97] transition-transform cursor-pointer mt-4"
          >
            <Plus className="h-4 w-4 shrink-0 stroke-[3]" />
            <span>CREATE DECK</span>
          </button>
        </nav>

        {/* Bottom legal */}
        <div className="mt-auto pt-4 border-t border-border flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground px-1">
            <Link to="/privacy" className="hover:text-primary hover:underline transition-colors">Privacy Policy</Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-primary hover:underline transition-colors">Terms & Conditions</Link>
          </div>
          <p className="text-[10px] font-bold text-muted-foreground text-center">© {new Date().getFullYear()} PikaDecks</p>
        </div>
      </aside>

      {/* MOBILE STICKY HEADER */}
      <header className="md:hidden flex items-center justify-between bg-card border-b border-border px-5 py-3.5 sticky top-0 z-40">
        <Link to="/dashboard" className="flex items-center gap-2 group">
          <img src="/appIcon.png" alt="Pikadecks logo" className="h-7 w-7 rounded-md transition-transform group-hover:rotate-[-4deg]" />
          <span className="font-display text-base font-extrabold tracking-tight text-foreground">
            Pikadecks
          </span>
        </Link>

        <Link
          to="/dashboard/profile"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border overflow-hidden"
        >
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground font-extrabold text-[10px]">
              {user?.firstName?.[0] || "U"}
            </div>
          )}
        </Link>
      </header>

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border px-2 py-2.5 flex items-center justify-around">
        {menuItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[9px] font-extrabold uppercase tracking-wider">{item.label}</span>
            </Link>
          );
        })}

        {/* Floating center create button */}
        <button
          onClick={() => setCreateModalOpen(true)}
          className="-mt-7 h-12 w-12 rounded-full bg-primary text-primary-foreground border-4 border-background flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          aria-label="Create Deck"
        >
          <Plus className="h-5 w-5 stroke-[2.5]" />
        </button>

        {menuItems.slice(2).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[9px] font-extrabold uppercase tracking-wider">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6 md:p-8 lg:p-10 relative pb-24 md:pb-8">
        <Outlet />
      </main>

      {/* CREATE DECK MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setCreateModalOpen(false)}>
          <div
            className="w-full max-w-3xl bg-card border border-border rounded-[2.5rem] p-6 md:p-8 space-y-6 md:space-y-8 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center space-y-1.5">
              <h3 className="font-display text-2xl font-extrabold text-foreground">Create New Deck</h3>
              <p className="text-sm font-semibold text-muted-foreground">Select a content source to generate flashcards</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* PDF Option */}
              <Link
                to="/dashboard/upload"
                onClick={() => setCreateModalOpen(false)}
                className="flex flex-col items-center text-center border border-border bg-background rounded-[2rem] p-6 hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 group cursor-pointer space-y-4"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-600 transition-transform group-hover:scale-110">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-foreground">PDF Document</h4>
                  <p className="text-xs font-semibold text-muted-foreground mt-1.5 leading-relaxed">Auto-generate flashcards from slides, documents, or textbooks.</p>
                </div>
              </Link>

              {/* YouTube Option */}
              <Link
                to="/dashboard/create-youtube"
                onClick={() => setCreateModalOpen(false)}
                className="flex flex-col items-center text-center border border-border bg-background rounded-[2rem] p-6 hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 group cursor-pointer space-y-4"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-500 transition-transform group-hover:scale-110">
                  <Youtube className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-foreground">YouTube Video</h4>
                  <p className="text-xs font-semibold text-muted-foreground mt-1.5 leading-relaxed">Convert a lecture, tutorial, or educational video link into study cards.</p>
                </div>
              </Link>

              {/* Manual Option */}
              <Link
                to="/dashboard/create-notes"
                onClick={() => setCreateModalOpen(false)}
                className="flex flex-col items-center text-center border border-border bg-background rounded-[2rem] p-6 hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 group cursor-pointer space-y-4"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-primary transition-transform group-hover:scale-110">
                  <Edit3 className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-foreground">Paste Notes</h4>
                  <p className="text-xs font-semibold text-muted-foreground mt-1.5 leading-relaxed">Type or paste lecture notes, outline summaries, or study scribbles.</p>
                </div>
              </Link>
            </div>

            <button
              onClick={() => setCreateModalOpen(false)}
              className="w-full border border-border bg-background text-foreground font-extrabold text-sm py-3.5 rounded-2xl hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
