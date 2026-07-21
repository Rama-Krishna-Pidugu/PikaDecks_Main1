import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Calendar, CheckCircle2, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Delete Account - PikaDecks" },
      {
        name: "description",
        content:
          "Request deletion of your PikaDecks account and learn what data is deleted or retained.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Delete Account - PikaDecks" },
      {
        property: "og:description",
        content:
          "Instructions for deleting your PikaDecks account and associated app data.",
      },
      { property: "og:url", content: "https://pikadecks.app/delete-account" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "https://pikadecks.app/delete-account" }],
  }),
  component: DeleteAccountPage,
});

const deletedData = [
  "Account profile information, including name, email address, avatar, and internal user IDs.",
  "Saved flashcard decks, manually created cards, AI-generated cards, and deck metadata.",
  "Uploaded document references, extracted text, notes, and generated study material tied to your account.",
  "Study progress, review history, spaced-repetition scheduling data, and app preferences.",
  "Authentication records and account links that are no longer required after deletion.",
];

const retainedData = [
  "Security, abuse-prevention, and server logs may be retained for up to 30 days.",
  "Encrypted backups may retain deleted records for up to 30 days before they are overwritten.",
  "Records we are legally required to keep, such as billing, fraud-prevention, tax, dispute, or compliance records, may be retained only for the required period.",
  "Anonymized analytics that cannot identify you may be kept to understand app performance.",
];

function DeleteAccountPage() {
  const [isWebView, setIsWebView] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsWebView(window.location.search.includes("webview=true"));
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#FBF8F2] text-[#2A241D] pb-16 font-sans">
      {!isWebView && <Navbar />}

      <section className={`px-6 pb-8 ${isWebView ? "pt-8" : "pt-28 md:pt-32"}`}>
        <div className="mx-auto max-w-3xl">
          {!isWebView && (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#111111] bg-white px-3 py-1.5 text-xs font-bold text-[#2A241D] shadow-[2px_2px_0_0_#111] transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#111] active:translate-y-0.5 active:shadow-[1px_1px_0_0_#111]"
            >
              Back to home
            </Link>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#111111]/10 bg-white px-3 py-1 text-xs font-bold shadow-[2px_2px_0_0_#111111]/5">
              Account and data deletion
            </span>
            <span className="flex items-center gap-1 text-xs font-bold text-[#867E70]">
              <Calendar className="h-3.5 w-3.5" />
              Last updated: May 30, 2026
            </span>
          </div>

          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-5xl">
            Delete your PikaDecks account
          </h1>

          <p className="mt-4 text-sm font-medium leading-relaxed text-[#867E70] md:text-base">
            This page explains how PikaDecks users can request account deletion, what account data is deleted,
            and how long limited retained data may remain in backups or compliance records.
          </p>
        </div>
      </section>

      <section className="px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <article className="rounded-[2rem] border-2 border-[#111111] bg-white p-6 shadow-[6px_6px_0_0_#111111] md:p-8">
            <div className="mb-4 flex items-center gap-4 border-b border-[#111111]/10 pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#111111] bg-rose-100 text-rose-600 shadow-[2px_2px_0_0_#111]">
                <Trash2 className="h-5 w-5" />
              </div>
              <h2 className="font-display text-lg font-bold md:text-xl">How to request deletion</h2>
            </div>

            <div className="space-y-4 text-sm font-medium leading-relaxed text-[#2A241D]/90 md:text-base">
              <p>
                You can request deletion directly in the PikaDecks app by opening your profile or settings page
                and choosing the delete account option.
              </p>
              <p>
                If you cannot access your account, email us from the email address registered with your PikaDecks
                account and use the subject line <strong>Account Deletion Request</strong>.
              </p>
              <a
                href="mailto:support@pikadecks.app?subject=Account%20Deletion%20Request"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[#111111] bg-[#5B4FE6] px-4 py-2 text-sm font-bold text-white shadow-[3px_3px_0_0_#111] transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#111]"
              >
                <Mail className="h-4 w-4" />
                support@pikadecks.app
              </a>
              <p className="text-xs font-bold uppercase tracking-wide text-[#867E70]">
                We may ask you to verify account ownership before processing the request.
              </p>
            </div>
          </article>

          <article className="rounded-[2rem] border-2 border-[#111111] bg-white p-6 shadow-[6px_6px_0_0_#111111] md:p-8">
            <div className="mb-4 flex items-center gap-4 border-b border-[#111111]/10 pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#111111] bg-green-100 text-green-600 shadow-[2px_2px_0_0_#111]">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h2 className="font-display text-lg font-bold md:text-xl">What data is deleted</h2>
            </div>

            <ul className="space-y-3">
              {deletedData.map((item) => (
                <li key={item} className="flex gap-2 text-sm font-medium leading-relaxed text-[#2A241D]/90 md:text-base">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5B4FE6]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[2rem] border-2 border-[#111111] bg-white p-6 shadow-[6px_6px_0_0_#111111] md:p-8">
            <div className="mb-4 flex items-center gap-4 border-b border-[#111111]/10 pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#111111] bg-amber-100 text-amber-600 shadow-[2px_2px_0_0_#111]">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h2 className="font-display text-lg font-bold md:text-xl">What data may be retained</h2>
            </div>

            <ul className="space-y-3">
              {retainedData.map((item) => (
                <li key={item} className="flex gap-2 text-sm font-medium leading-relaxed text-[#2A241D]/90 md:text-base">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C47A12]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[2rem] border-2 border-[#111111] bg-white p-6 shadow-[6px_6px_0_0_#111111] md:p-8">
            <div className="mb-4 flex items-center gap-4 border-b border-[#111111]/10 pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#111111] bg-blue-100 text-blue-600 shadow-[2px_2px_0_0_#111]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="font-display text-lg font-bold md:text-xl">Processing timeline</h2>
            </div>

            <p className="text-sm font-medium leading-relaxed text-[#2A241D]/90 md:text-base">
              Account deletion requests are normally processed within 7 days after verification. Most active account
              data is deleted during processing. Backup copies and security logs may remain for up to 30 days before
              automatic deletion or overwrite, unless longer retention is required by law.
            </p>
          </article>
        </div>
      </section>

      {!isWebView && <Footer />}
    </main>
  );
}
