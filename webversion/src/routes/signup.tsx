import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { SignUp, useAuth } from "@clerk/tanstack-react-start";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = Route.useSearch() as Record<string, string>;
  const redirectUrlParam = searchParams.redirect_url;

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void router.navigate({
        to: "/login",
        search: redirectUrlParam ? { redirect_url: redirectUrlParam } : undefined,
      });
    }
  }, [isLoaded, isSignedIn, router, redirectUrlParam]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-sm font-bold text-muted-foreground tracking-wider uppercase">Preparing PikaDecks...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background font-sans relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30" aria-hidden="true" />
      <div className="absolute inset-0 bg-radial-yellow" aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-6 py-10">
        <Link to="/" className="mb-8 inline-flex items-center gap-2.5">
          <img src="/appIcon.png" alt="Pikadecks logo" className="h-10 w-10 rounded-xl" />
          <span className="font-display text-lg font-extrabold tracking-tight text-foreground">
            Pikadecks
          </span>
        </Link>

        <div className="w-full max-w-md text-center">
          <h1 className="font-display text-3xl font-extrabold text-foreground leading-tight">
            Create your PikaDecks account
          </h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            Start saving decks, uploads, and review history.
          </p>
        </div>

        <div className="mt-8 w-full max-w-md rounded-[2.5rem] border border-border bg-card p-6 shadow-soft overflow-hidden">
          <SignUp
            routing="hash"
            fallbackRedirectUrl={redirectUrlParam ? `/login?redirect_url=${encodeURIComponent(redirectUrlParam)}` : "/login"}
            signInUrl={redirectUrlParam ? `/login?redirect_url=${encodeURIComponent(redirectUrlParam)}` : "/login"}
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
                card: "shadow-none border-0 p-0 m-0 w-full bg-transparent",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                footer: "hidden",
                socialButtonsBlockButton: "border border-border rounded-2xl shadow-soft font-bold text-sm h-12 transition-all hover:bg-muted/45 hover:scale-[0.99] duration-200",
                formButtonPrimary: "rounded-2xl font-bold h-12",
              },
            }}
          />
        </div>

        <p className="mt-6 text-center text-xs font-bold text-muted-foreground">
          Already have an account?{" "}
          <Link 
            to="/login" 
            search={redirectUrlParam ? { redirect_url: redirectUrlParam } : undefined}
            className="text-primary underline hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
