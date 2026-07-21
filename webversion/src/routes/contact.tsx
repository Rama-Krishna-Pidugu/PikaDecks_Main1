import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, Mail, MessageSquare, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact - Pikadecks" },
      { name: "description", content: "Contact the PikaDecks team for support, partnerships, privacy requests, and product questions." },
      { property: "og:title", content: "Contact PikaDecks" },
      { property: "og:description", content: "Reach the PikaDecks team for support, privacy, partnerships, and product questions." },
      { property: "og:url", content: "https://pikadecks.app/contact" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://pikadecks.app/contact" }],
  }),
  component: ContactPage,
});

const contacts = [
  {
    title: "Product Support",
    email: "support@pikadecks.app",
    text: "Login, upload, AI generation, billing, and account help.",
    icon: MessageSquare,
  },
  {
    title: "Privacy Requests",
    email: "privacy@pikadecks.app",
    text: "Data deletion, privacy rights, and account data questions.",
    icon: ShieldCheck,
  },
  {
    title: "General Contact",
    email: "hello@pikadecks.app",
    text: "Partnerships, feedback, press, and product questions.",
    icon: Mail,
  },
];

function ContactPage() {
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const copyEmail = async (email: string) => {
    await navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    window.setTimeout(() => setCopiedEmail(null), 1800);
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
              <Mail className="h-3.5 w-3.5" />
              CONTACT
            </div>
            <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight md:text-6xl">
              Talk to PikaDecks
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-muted-foreground md:text-base">
              Choose the right inbox and send us a note. We usually reply within 24 to 72 business hours.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {contacts.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="flex flex-col rounded-3xl border border-border bg-card p-6 shadow-soft">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-brand-soft text-primary shadow-soft">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 font-display text-xl font-extrabold">{item.title}</h2>
                  <p className="mt-2 flex-1 text-sm font-semibold leading-relaxed text-muted-foreground">{item.text}</p>
                  <button
                    type="button"
                    onClick={() => void copyEmail(item.email)}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-extrabold text-primary shadow-soft hover:bg-muted"
                  >
                    {copiedEmail === item.email ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {item.email}
                    <span className="text-xs font-bold text-muted-foreground">
                      {copiedEmail === item.email ? "Copied" : "Copy"}
                    </span>
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
