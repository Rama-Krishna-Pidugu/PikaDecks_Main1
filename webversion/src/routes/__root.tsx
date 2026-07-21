import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { ClerkProvider } from "@clerk/tanstack-react-start";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import Sentry from "@/lib/sentry";

import appCss from "../styles.css?url";

// DECLARE GLOBAL CLERK TYPE FOR THE WINDOW OBJECT: Fixes all typescript window.Clerk errors in routes
declare global {
  interface Window {
    Clerk?: any;
  }
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">This card got shuffled out of the deck.</p>
        <div className="mt-6">
          <Link to="/" className="btn-pop inline-flex items-center justify-center rounded-xl bg-brand-yellow px-4 py-2 text-sm font-bold text-foreground">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  Sentry.captureException(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Looks like we shuffled the cards a bit too hard.</p>
        <div className="mt-6 flex justify-center gap-4">
          <button onClick={() => reset()} className="btn-pop inline-flex items-center justify-center rounded-xl bg-brand-yellow px-4 py-2 text-sm font-bold text-foreground cursor-pointer">
            Try again
          </button>
          <Link to="/" className="btn-pop inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-bold text-foreground">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PikaDecks — Smart AI Flashcards" },
      { name: "description", content: "Turn any document, PDF, or text notes into beautiful active-recall flashcards automatically using AI." },
      { name: "author", content: "Pikadecks" },
      { property: "og:title", content: "PikaDecks — Smart AI Flashcards" },
      { property: "og:description", content: "Convert PDFs & notes into spaced repetition study decks." },
      { property: "og:image", content: "https://pikadecks.app/og-image.png" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@pikadecks" },
      { name: "twitter:title", content: "PikaDecks — Smart AI Flashcards" },
      { name: "twitter:description", content: "Active recall flashcards generated instantly by artificial intelligence." },
      { name: "twitter:image", content: "https://pikadecks.app/og-image.png" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/appIcon.png" },
      { rel: "shortcut icon", href: "/appIcon.png" },
      { rel: "apple-touch-icon", href: "/appIcon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Pikadecks",
          url: "https://pikadecks.app",
          logo: "https://pikadecks.app/og-image.png",
          description: "AI-powered flashcard learning app that turns any content into spaced-repetition study decks.",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
        <Scripts />
      </body>
    </html>
  );
}

import { ProcessingProvider } from "@/context/processing-context";
import { GlobalProcessingUI } from "@/components/global-processing-ui";


function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Resolve Clerk publishable key from environment variables only (no hardcoded fallback)
  const publishableKey =
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
    (typeof process !== "undefined" ? process.env.CLERK_PUBLISHABLE_KEY : undefined);

  if (!publishableKey) {
    console.error("[PikaDecks] VITE_CLERK_PUBLISHABLE_KEY is not set!");
  }

  const ClerkProviderComponent = ClerkProvider as any;

  return (
    <QueryClientProvider client={queryClient}>
      <ClerkProviderComponent
        publishableKey={publishableKey ?? ""}
      >
        <ProcessingProvider>
          <Outlet />
          <GlobalProcessingUI />
        </ProcessingProvider>
      </ClerkProviderComponent>
    </QueryClientProvider>
  );
}
