import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useState } from "react";
import { Sliders, Sparkles, Loader2, AlertCircle, Edit3 } from "lucide-react";
import { apiFetch } from "@/lib/api";

import { useUploadUsage } from "@/lib/queries";

export const Route = createFileRoute("/dashboard/create-notes")({
  component: CreateNotesPage,
});

function CreateNotesPage() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [cardLimit, setCardLimit] = useState(10);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usageQuery = useUploadUsage();
  const usage = usageQuery.data;

  const ready = notes.trim().length > 10;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;

    setUploading(true);
    setError(null);
    try {
      await apiFetch("/uploads/process-notes", {
        method: "POST",
        getToken,
        bodyJson: {
          title: title.trim() || undefined,
          notes: notes.trim(),
          num_cards: cardLimit,
        },
      });

      alert("Success! Flashcards generated from notes.");
      router.navigate({ to: "/dashboard/decks" });
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-4 py-6 md:py-8 font-sans pb-20">
      {/* Back link */}
      <nav>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:underline transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </nav>

      {/* Page Header */}
      <section className="border-b border-border pb-4">
        <h1 className="font-display text-3xl font-extrabold text-foreground tracking-tight">
          Paste Notes & Scribbles
        </h1>
        <p className="text-sm font-semibold text-muted-foreground mt-1.5 leading-relaxed">
          Paste textbook paragraphs, raw study transcripts, outline guides, or random definitions!
        </p>
        {usage ? (
          <p className="mt-2 text-xs font-bold text-primary">
            {usage.unlimited ? "Unlimited AI generations available" : `${usage.remaining ?? 0}/${usage.limit ?? 10} AI generations remaining`}
          </p>
        ) : null}
      </section>

      {uploading ? (
        /* Progress loader */
        <div className="border border-border bg-card rounded-[2.5rem] p-10 flex flex-col items-center justify-center text-center gap-6 min-h-[320px]">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-primary animate-bounce">
            <Edit3 className="h-8 w-8 stroke-[2.5]" />
          </div>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="space-y-1">
            <h3 className="font-display text-lg font-extrabold text-foreground">AI Outliner Active</h3>
            <p className="text-xs font-bold text-primary max-w-sm mx-auto leading-relaxed animate-pulse">
              AI is reading your scribbles and generating study cards... (this may take ~30s)
            </p>
          </div>
        </div>
      ) : (
        /* Form view */
        <form onSubmit={handleGenerate} className="space-y-6">
          {error && (
            <div className="border border-rose-200 rounded-2xl bg-rose-50/50 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
              <p className="text-xs font-bold text-rose-600 leading-relaxed">{error}</p>
            </div>
          )}

          {/* Form fields card */}
          <div className="border border-border bg-card rounded-[2.5rem] p-6 md:p-8 space-y-6">
            {/* Title field */}
            <div className="space-y-2">
              <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest pl-1 block">
                Deck Title (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Biology Exam Prep, AWS VPC guidelines..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-border rounded-2xl px-4 py-3 bg-background font-semibold text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Notes Body field */}
            <div className="space-y-2">
              <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest pl-1 block">
                Paste your scribbles or outline text
              </label>
              <textarea
                required
                placeholder="Paste lecture notes, textbook summaries, definitions, or study cheat sheets here (at least 10 characters)..."
                rows={8}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-border rounded-2xl p-4 bg-background font-semibold text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
              />
              <div className="flex justify-end text-[9px] font-extrabold text-muted-foreground tracking-widest uppercase px-0.5">
                <span>{notes.length} characters</span>
              </div>
            </div>
          </div>

          {/* Generator Limit Slider Card */}
          <div className="border border-border bg-card rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-extrabold text-primary uppercase tracking-widest pl-0.5">
                <Sliders className="h-4 w-4" />
                <span>Cards to generate</span>
              </div>
              <span className="bg-indigo-50 text-primary font-extrabold text-xs px-3.5 py-1.5 rounded-xl border border-indigo-100">
                {cardLimit} cards
              </span>
            </div>

            <div className="space-y-2">
              <input
                type="range"
                min="5"
                max="30"
                value={cardLimit}
                onChange={(e) => setCardLimit(parseInt(e.target.value))}
                className="w-full h-2 bg-background border border-border/80 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[9px] font-extrabold text-muted-foreground tracking-widest uppercase px-0.5">
                <span>Min: 5</span>
                <span className="text-primary/75">Default: 10</span>
                <span>Max: 30</span>
              </div>
            </div>
          </div>

          {/* Form Action */}
          <button
            type="submit"
            disabled={!ready}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-extrabold text-sm py-4 rounded-2xl hover:scale-[0.98] transition-transform disabled:opacity-50 disabled:scale-100 cursor-pointer"
          >
            <Sparkles className="h-5 w-5 stroke-[2.5]" />
            <span>GENERATE AI FLASHCARDS</span>
          </button>
        </form>
      )}
    </div>
  );
}
