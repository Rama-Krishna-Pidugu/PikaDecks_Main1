import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, Check, Copy, CreditCard, LockKeyhole, Mail, RefreshCw, UploadCloud } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support - Pikadecks" },
      { name: "description", content: "Get help with PikaDecks login, uploads, AI card generation, billing, account deletion, and product issues." },
      { property: "og:title", content: "PikaDecks Support" },
      { property: "og:description", content: "Help for account, billing, upload, and AI generation issues." },
      { property: "og:url", content: "https://pikadecks.app/support" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://pikadecks.app/support" }],
  }),
  component: SupportPage,
});

const supportTopics = [
  {
    title: "Login Problems",
    text: "Google sign-in, account sessions, or dashboard access errors.",
    icon: LockKeyhole,
  },
  {
    title: "Upload Issues",
    text: "PDF upload failures, processing errors, or missing generated decks.",
    icon: UploadCloud,
  },
  {
    title: "AI Generation",
    text: "Low-quality cards, missing content, or generation taking too long.",
    icon: RefreshCw,
  },
  {
    title: "Billing",
    text: "Plan questions, payment issues, invoices, or subscription changes.",
    icon: CreditCard,
  },
];

function SupportPage() {
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    await navigator.clipboard.writeText("support@pikadecks.app");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <Navbar />

      <section className="px-4 pt-24 pb-16 md:pt-32">
        <div className="mx-auto max-w-5xl">
          <Link
            to="/"
            className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground shadow-soft hover:text-foreground"
          >
            Back to home
          </Link>

          <div className="mt-8 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-extrabold text-primary shadow-soft">
              <AlertCircle className="h-3.5 w-3.5" />
              SUPPORT CENTER
            </div>
            <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight md:text-6xl">
              How can we help?
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-muted-foreground md:text-base">
              Send us the details and we will help with login, uploads, AI generation, billing, or account issues.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {supportTopics.map((topic) => {
              const Icon = topic.icon;
              return (
                <article key={topic.title} className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-brand-soft text-primary shadow-soft">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 font-display text-xl font-extrabold">{topic.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-muted-foreground">{topic.text}</p>
                </article>
              );
            })}
          </div>

          <section className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-display text-2xl font-extrabold">Email support</h2>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">
                  Include your account email, what you clicked, and any error message you saw.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyEmail()}
                className="btn-pop inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-yellow px-5 py-3 text-sm font-extrabold text-brand-ink"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                support@pikadecks.app
                <span className="text-xs font-bold opacity-70">{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </section>
        </div>
      </section>

      <Footer />
    </main>
  );
}
