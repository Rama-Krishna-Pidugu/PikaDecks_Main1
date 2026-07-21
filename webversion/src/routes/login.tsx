import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { SignIn, SignOutButton } from "@clerk/tanstack-react-start";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { syncUser } from "@/lib/api";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncAttempt, setSyncAttempt] = useState(0);

  const searchParams = Route.useSearch() as Record<string, string>;
  const redirectUrlParam = searchParams.redirect_url;
  const clerkFallbackUrl = redirectUrlParam 
    ? `/login?redirect_url=${encodeURIComponent(redirectUrlParam)}`
    : "/login";
  const clerkSignUpUrl = redirectUrlParam 
    ? `/signup?redirect_url=${encodeURIComponent(redirectUrlParam)}`
    : "/signup";

  // A user is only allowed into the dashboard after Clerk auth and backend sync both pass.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setSyncError(null);
      return;
    }

    const syncBeforeDashboard = async () => {
      setSyncError(null);
      try {
        await syncUser(getToken);

        if (redirectUrlParam) {
          window.location.href = redirectUrlParam;
        } else {
          void router.navigate({ to: "/dashboard" });
        }
      } catch (e: any) {
        console.error("User sync error:", e);
        setSyncError(e?.message || "Please try again.");
      }
    };

    void syncBeforeDashboard();
  }, [isLoaded, isSignedIn, getToken, router, syncAttempt, redirectUrlParam]);

  // Loading state
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-sm font-bold text-muted-foreground tracking-wider uppercase">Loading PikaDecks...</p>
      </div>
    );
  }

  if (isSignedIn && syncError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground font-sans px-6 text-center">
        <Link to="/" className="mb-8 inline-flex items-center gap-2.5">
          <img src="/appIcon.png" alt="Pikadecks logo" className="h-10 w-10 rounded-xl" />
          <span className="font-display text-lg font-extrabold tracking-tight text-foreground">
            Pikadecks
          </span>
        </Link>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-rose-500 shadow-soft">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Please try again</h1>
        <p className="mt-2 max-w-sm text-sm font-semibold text-muted-foreground">
          You are signed in, but PikaDecks could not connect your account yet.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
          <button
            onClick={() => setSyncAttempt((value) => value + 1)}
            className="btn-pop inline-flex items-center justify-center rounded-xl bg-brand-yellow px-5 py-3 text-sm font-bold text-brand-ink"
          >
            Retry
          </button>
          <SignOutButton redirectUrl="/login">
            <button className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold text-foreground shadow-soft hover:bg-muted">
              Sign out
            </button>
          </SignOutButton>
        </div>
      </div>
    );
  }

  // Already signed in, but backend sync has not completed yet.
  if (isSignedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-sm font-bold text-muted-foreground tracking-wider uppercase">Connecting your account...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background font-sans relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 bg-grid opacity-30" aria-hidden="true" />
      <div className="absolute inset-0 bg-radial-yellow" aria-hidden="true" />

      <div className="relative w-full flex flex-col lg:flex-row min-h-screen z-10">

        {/* LEFT COLUMN: Product showcase — desktop only */}
        <div className="hidden lg:flex lg:w-[50%] flex-col justify-between p-12 border-r border-border bg-background/80 relative overflow-hidden">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 self-start group">
            <img src="/appIcon.png" alt="Pikadecks logo" className="h-8 w-8 rounded-lg transition-transform group-hover:rotate-[-4deg]" />
            <span className="font-display text-lg font-extrabold tracking-tight text-foreground">
              Pikadecks
            </span>
          </Link>

          {/* Showcase */}
          <div className="my-auto max-w-xl space-y-8">
            <div className="space-y-4 animate-fade-in">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3.5 py-1 text-xs font-extrabold text-brand-foreground shadow-soft">
                ✨ AI-POWERED SPACED REPETITION
              </div>
              <h2 className="font-display text-4xl xl:text-5xl font-extrabold text-foreground leading-tight">
                Master any subject 10x faster.
              </h2>
              <p className="text-sm md:text-base font-semibold text-muted-foreground leading-relaxed max-w-lg">
                Upload PDF slides, notes, or web outlines. Get beautifully organized, smart flashcards instantly synchronized with your mobile app.
              </p>
            </div>

            {/* Study Card widget */}
            <div className="relative pt-6">
              <div className="relative z-10 w-full max-w-md border border-border bg-card rounded-[2.5rem] p-6 shadow-soft hover:translate-y-[-2px] transition-all">
                <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
                  <span className="text-[10px] font-extrabold text-primary tracking-wider uppercase">Active Study Session</span>
                  <span className="flex items-center gap-1.5 text-xs font-extrabold text-rose-500">
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                    Live Syncing
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider">Question</p>
                    <h4 className="text-sm md:text-base font-extrabold text-foreground">What is the Spacing Effect in memory?</h4>
                  </div>
                  <div className="border border-border pt-3 space-y-1.5 bg-background rounded-2xl p-3">
                    <p className="text-[9px] font-extrabold text-emerald-500 uppercase tracking-wider">AI Answer Outline</p>
                    <p className="text-xs font-semibold text-foreground/80 leading-relaxed">
                      The cognitive phenomenon where information is more easily recalled if exposure is spaced out across time, rather than crammed in one session.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-5">
                  <div className="border border-border rounded-xl p-1.5 text-center bg-rose-50/50">
                    <p className="text-[9px] font-bold text-rose-500">Again</p>
                    <p className="text-[8px] font-bold text-muted-foreground">1m</p>
                  </div>
                  <div className="border border-border rounded-xl p-1.5 text-center bg-amber-50/50">
                    <p className="text-[9px] font-bold text-amber-500">Hard</p>
                    <p className="text-[8px] font-bold text-muted-foreground">12h</p>
                  </div>
                  <div className="border border-border rounded-xl p-1.5 text-center bg-emerald-50/50">
                    <p className="text-[9px] font-bold text-emerald-500">Good</p>
                    <p className="text-[8px] font-bold text-muted-foreground">4d</p>
                  </div>
                  <div className="border border-primary/20 rounded-xl p-1.5 text-center bg-primary/5 font-extrabold">
                    <p className="text-[9px] font-bold text-primary">Easy</p>
                    <p className="text-[8px] font-bold text-muted-foreground">8d</p>
                  </div>
                </div>
              </div>

              {/* Floating streak badge */}
              <div className="absolute -bottom-6 -right-6 z-20 border border-border bg-brand rounded-[2rem] p-4 shadow-soft flex items-center gap-3 rotate-[3deg] hover:rotate-0 transition-transform cursor-default">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border text-lg shadow-soft">
                  🔥
                </div>
                <div>
                  <h5 className="text-[10px] font-extrabold text-brand-foreground uppercase tracking-wider leading-none">Streak Master</h5>
                  <p className="text-xs md:text-sm font-extrabold text-foreground mt-1">14 Days Active</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer legal */}
          <div className="flex items-center gap-6 text-xs font-semibold text-muted-foreground">
            <span>© {new Date().getFullYear()} PikaDecks.</span>
            <Link to="/privacy" className="hover:text-foreground hover:underline transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground hover:underline transition-colors">Terms & Conditions</Link>
          </div>
        </div>

        {/* RIGHT COLUMN: Sign In */}
        <div className="flex-1 flex flex-col justify-between p-6 md:p-12 min-h-screen">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center py-4">
            <Link to="/" className="flex items-center gap-2.5">
              <img src="/favicon.svg" alt="Pikadecks logo" className="h-8 w-8" />
              <span className="font-display text-lg font-bold tracking-tight text-foreground">Pikadecks</span>
            </Link>
          </div>

          {/* Sign In card */}
          <div className="my-auto w-full max-w-md mx-auto flex flex-col items-center">
            <div className="lg:hidden mb-6 flex items-center justify-center animate-float">
              <img src="/favicon.svg" alt="Pika logo" className="h-16 w-16" />
            </div>

            <h1 className="font-display text-3xl font-extrabold text-foreground text-center leading-tight mb-2">
              Sign in to PikaDecks
            </h1>
            <p className="text-sm font-semibold text-muted-foreground text-center mb-8 max-w-xs">
              Save your decks and review history across all devices.
            </p>

            <div className="w-full max-w-sm">
              <SignIn
                routing="hash"
                fallbackRedirectUrl={clerkFallbackUrl}
                signUpUrl={clerkSignUpUrl}
                appearance={{
                  variables: {
                    colorPrimary: "#5B4FE6",
                    colorText: "#2A241D",
                    colorBackground: "#FFFFFF",
                    colorTextOnPrimaryBackground: "#FFFFFF",
                    borderRadius: "1.25rem",
                    fontFamily: "Inter, sans-serif",
                  },
                  elements: {
                    rootBox: "w-full",
                    card: "w-full rounded-[2rem] border border-border bg-card px-6 py-7 shadow-soft",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    // Google OAuth only — hide Clerk branding & sign-up link
                    footer: "hidden",
                    socialButtonsBlockButton: "border border-border rounded-2xl shadow-soft font-bold text-sm h-12 transition-all hover:bg-muted/45 hover:scale-[0.99] duration-200",
                    identityPreviewText: "font-semibold text-sm",
                  }
                }}
              />
            </div>

            <p className="mt-5 text-center text-xs font-bold text-muted-foreground">
              New to PikaDecks?{" "}
              <Link 
                to="/signup" 
                search={redirectUrlParam ? { redirect_url: redirectUrlParam } : undefined}
                className="text-primary underline hover:text-foreground transition-colors"
              >
                Create an account
              </Link>
            </p>

            {/* Terms & Privacy */}
            <p className="mt-6 text-center text-xs font-bold text-muted-foreground leading-relaxed max-w-xs px-2">
              By signing in, you agree to our{" "}
              <Link to="/terms" className="text-primary underline hover:text-foreground transition-colors">
                Terms & Conditions
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-primary underline hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              .
            </p>

            <Link
              to="/"
              className="mt-8 text-xs font-extrabold text-primary bg-card border border-border rounded-2xl px-4 py-2.5 shadow-soft hover:scale-[0.98] transition-all"
            >
              ← Back to Homepage
            </Link>
          </div>

          {/* Mobile footer */}
          <div className="lg:hidden flex flex-col items-center gap-2 pt-8 border-t border-border/40 text-center text-[10px] font-semibold text-muted-foreground">
            <p>© {new Date().getFullYear()} PikaDecks.</p>
            <div className="flex gap-4">
              <Link to="/privacy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-foreground hover:underline">Terms & Conditions</Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
