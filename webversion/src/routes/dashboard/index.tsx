import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useUser } from "@clerk/tanstack-react-start";
import { useState } from "react";
import { Plus, Flame, Award, BookOpen, Layers, ArrowRight, Loader2, Sparkles, AlertCircle, Youtube, Clock } from "lucide-react";
import { getDeckTint, getDeckEmoji } from "@/lib/theme";
import { useDecks, useStats, useCreateDeck } from "@/lib/queries";

export const Route = createFileRoute("/dashboard/")(
{
  component: DashboardHome,
});

function DashboardHome() {
  const { user } = useUser();
  const router = useRouter();

  // TanStack Query hooks — shared cache with other pages
  const decksQuery = useDecks();
  const statsQuery = useStats();
  const createDeckMutation = useCreateDeck();

  const decks = decksQuery.data || [];
  const streak = statsQuery.data?.current_streak || 0;
  const loading = decksQuery.isLoading || statsQuery.isLoading;
  const error = decksQuery.error?.message || statsQuery.error?.message || null;

  // New deck creation state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await createDeckMutation.mutateAsync({
        title: newTitle.trim(),
        description: "Manually created study deck",
      });
      setCreateModalOpen(false);
      setNewTitle("");
    } catch (e: any) {
      alert(e?.message || "Could not create deck.");
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto font-sans px-2 sm:px-4">
      {/* Dynamic Welcome Heading & Streak Row */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-foreground tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted-foreground font-semibold text-sm mt-1">
            Hey {user?.firstName || "Scholar"}, ready to smash your studies today? 🚀
          </p>
        </div>

        {/* Streak Indicator */}
        <Link
          to="/dashboard/streak"
          className="flex items-center gap-3 bg-card border border-border px-5 py-3 rounded-2xl self-start sm:self-auto transition-all hover:scale-[1.01] hover:border-orange-200 cursor-pointer"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-500 border border-orange-100">
            <Flame className="h-5 w-5 fill-current" />
          </div>
          <div>
            <p className="text-[9px] font-extrabold text-muted-foreground tracking-widest uppercase leading-none">
              Daily Streak
            </p>
            <p className="text-base font-extrabold text-foreground mt-1">
              {streak} {streak === 1 ? "day" : "days"}
            </p>
          </div>
        </Link>
      </section>

      {/* Main Grid Layout: Scales automatically on mobile, tablet, and desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Due Review section & My Decks List */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Due Status / Catch Up Panel */}
          {loading ? (
            <div className="border border-dashed border-border rounded-[2rem] bg-card p-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm font-bold text-muted-foreground">Checking due reviews...</p>
            </div>
          ) : error ? (
            <div className="border border-border rounded-[2rem] bg-rose-50/50 p-6 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card border border-border text-rose-500">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="space-y-3">
                <h3 className="font-display text-lg font-extrabold text-foreground">Connection Issue</h3>
                <p className="text-xs font-semibold text-muted-foreground leading-relaxed">{error}</p>
                <button
                  onClick={() => { void decksQuery.refetch(); void statsQuery.refetch(); }}
                  className="border border-border bg-card text-xs font-extrabold px-4 py-2 rounded-xl hover:scale-[0.98] cursor-pointer"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          ) : decks.length === 0 ? (
            <div className="space-y-8">
              <div className="border border-border rounded-[2.5rem] bg-card p-8 flex flex-col sm:flex-row items-center gap-6">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-border bg-brand-soft text-brand-foreground">
                  <span className="text-3xl">🚀</span>
                </div>
                <div className="space-y-2 text-center sm:text-left">
                  <h3 className="font-display text-xl font-extrabold text-foreground">Welcome to PikaDecks!</h3>
                  <p className="text-xs md:text-sm font-semibold text-muted-foreground leading-relaxed">
                    Upload slides, lecture notes, or paste manual study outlines to let AI auto-generate your very first spaced-repetition deck in seconds.
                  </p>
                </div>
              </div>

              <div className="text-center py-2">
                <h2 className="font-display text-2xl font-extrabold text-foreground">Create Your First Deck</h2>
                <p className="text-sm font-semibold text-muted-foreground mt-1">Select a creation option to get started instantly</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* PDF Option */}
                <Link
                  to="/dashboard/upload"
                  className="flex flex-col items-center text-center border border-border bg-card rounded-[2rem] p-6 hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 group cursor-pointer space-y-4"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-600 transition-transform group-hover:scale-110">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-foreground">PDF Document</h4>
                    <p className="text-xs font-semibold text-muted-foreground mt-1.5 leading-relaxed">Auto-generate flashcards from slides, documents, or textbooks.</p>
                  </div>
                </Link>

                {/* YouTube Option */}
                <Link
                  to="/dashboard/create-youtube"
                  className="flex flex-col items-center text-center border border-border bg-card rounded-[2rem] p-6 hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 group cursor-pointer space-y-4"
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
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="flex flex-col items-center text-center border border-border bg-card rounded-[2rem] p-6 w-full hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 group cursor-pointer space-y-4"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-primary transition-transform group-hover:scale-110">
                    <Plus className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-foreground">Create Manually</h4>
                    <p className="text-xs font-semibold text-muted-foreground mt-1.5 leading-relaxed">Build a new empty deck slot and edit or add flashcards yourself.</p>
                  </div>
                </button>
              </div>
            </div>
          ) : statsQuery.data?.due_today && statsQuery.data.due_today > 0 ? (
            /* Due Today Review Panel */
            <div className="border border-indigo-100 rounded-[2.5rem] bg-card p-6 sm:p-8 flex flex-col gap-6 shadow-sm">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 text-primary">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-extrabold text-foreground">Due Today</h3>
                    <p className="text-xs font-semibold text-muted-foreground mt-1">
                      {statsQuery.data.due_today} cards ready{(statsQuery.data.overdue ?? 0) > 0 ? `, ${statsQuery.data.overdue} overdue` : ""}
                    </p>
                  </div>
                </div>

                <Link
                  to="/dashboard/review/start"
                  className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-xs font-extrabold text-primary-foreground hover:scale-[0.98] transition-transform cursor-pointer"
                >
                  <span>Review</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-4 border-t border-border/40 pt-6 text-center">
                <div>
                  <div className="font-display font-extrabold text-xl text-foreground">
                    {statsQuery.data?.cards_learned || 0}
                  </div>
                  <div className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest mt-1">
                    Learned
                  </div>
                </div>
                <div>
                  <div className="font-display font-extrabold text-xl text-foreground">
                    {streak}
                  </div>
                  <div className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest mt-1">
                    Streak
                  </div>
                </div>
                <div>
                  <div className="font-display font-extrabold text-xl text-foreground">
                    {statsQuery.data?.upcoming_reviews || 0}
                  </div>
                  <div className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest mt-1">
                    Upcoming
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* All Caught Up banner */
            <div className="border border-emerald-100 rounded-[2.5rem] bg-emerald-50/40 p-6 sm:p-8 flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-card">
                  <span className="text-3xl">🎉</span>
                </div>
                <div className="space-y-1 text-center sm:text-left">
                  <h3 className="font-display text-xl font-extrabold text-emerald-600">All caught up!</h3>
                  <p className="text-xs font-semibold text-muted-foreground leading-relaxed">
                    {streak > 0
                      ? `Excellent! You've finished all due reviews today. Keep your ${streak}-day streak burning bright!`
                      : "No cards due for review today. Great work staying ahead!"}
                  </p>
                </div>
              </div>

              {/* Study other decks list */}
              <div className="border-t border-emerald-100/50 pt-4 space-y-3">
                <p className="text-[9px] font-extrabold text-emerald-600 tracking-widest uppercase">
                  STUDY OTHER DECKS
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {decks.slice(0, 4).map((deck, idx) => (
                    <Link
                      key={deck.deck_id}
                      to="/dashboard/deck/$deckId"
                      params={{ deckId: deck.deck_id }}
                      className="flex items-center gap-3 border border-border bg-card rounded-2xl p-3.5 hover:scale-[0.99] transition-all"
                    >
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl border border-border ${getDeckTint(idx)} text-sm`}>
                        {getDeckEmoji(idx)}
                      </div>
                      <span className="line-clamp-2 flex-1 break-words pl-1 text-xs font-bold leading-snug text-foreground">
                        {deck.title}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* User Decks Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-xl font-extrabold text-foreground">
                My Decks
              </h2>
              <div className="flex items-center gap-3">
                <Link
                  to="/dashboard/decks"
                  className="text-xs font-bold text-primary hover:underline"
                >
                  View all
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-20 bg-card border border-border/80 rounded-[1.75rem] animate-pulse" />
                ))}
              </div>
            ) : decks.length === 0 ? (
              <div className="border border-dashed border-border/80 rounded-[2rem] bg-card p-12 text-center">
                <span className="text-3xl block mb-2">📭</span>
                <p className="text-xs font-bold text-muted-foreground">No study decks found. Create one manually or upload documents!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {decks.slice(0, 3).map((deck, idx) => (
                  <Link
                    key={deck.deck_id}
                    to="/dashboard/deck/$deckId"
                    params={{ deckId: deck.deck_id }}
                    className="flex items-center gap-4 border border-border bg-card rounded-[1.75rem] p-4 hover:scale-[0.99] transition-all cursor-pointer"
                  >
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border ${getDeckTint(idx)} text-2xl`}>
                      {getDeckEmoji(idx)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="line-clamp-2 break-words text-sm md:text-base font-extrabold text-foreground leading-snug">
                        {deck.title}
                      </h4>
                      <p className="text-[11px] font-bold text-muted-foreground truncate leading-none mt-1.5">
                        {deck.description || "Active study deck"}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Col: Quick Actions & Motivation (Tablet/Desktop sidebar layout inside index) */}
        <div className="space-y-6">
          
          {/* AI Fast-Create */}
          <section className="border border-border rounded-[2rem] bg-card p-6 space-y-6">
            <h3 className="font-display text-lg font-extrabold text-foreground border-b border-border pb-3 flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-primary" />
              AI Fast-Create
            </h3>

            <div className="space-y-3">
              <Link
                to="/dashboard/upload"
                className="w-full flex items-center gap-3 border border-border bg-background rounded-2xl p-3.5 hover:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-600">
                  <BookOpen className="h-4.5 w-4.5" />
                </div>
                <div className="text-left min-w-0 pl-1">
                  <p className="text-xs font-extrabold truncate leading-tight text-foreground">Document to Cards</p>
                  <p className="text-[9px] font-bold text-muted-foreground truncate leading-none mt-1">Upload a PDF outline</p>
                </div>
              </Link>

              <Link
                to="/dashboard/create-youtube"
                className="w-full flex items-center gap-3 border border-border bg-background rounded-2xl p-3.5 hover:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-500">
                  <Youtube className="h-4.5 w-4.5" />
                </div>
                <div className="text-left min-w-0 pl-1">
                  <p className="text-xs font-extrabold truncate leading-tight text-foreground">Video to Cards</p>
                  <p className="text-[9px] font-bold text-muted-foreground truncate leading-none mt-1">Paste a YouTube lecture</p>
                </div>
              </Link>

              <Link
                to="/dashboard/create-notes"
                className="w-full flex items-center gap-3 border border-border bg-background rounded-2xl p-3.5 hover:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-primary">
                  <Layers className="h-4.5 w-4.5" />
                </div>
                <div className="text-left min-w-0 pl-1">
                  <p className="text-xs font-extrabold truncate leading-tight text-foreground">Paste Scribble-Notes</p>
                  <p className="text-[9px] font-bold text-muted-foreground truncate leading-none mt-1">Turn raw text to quizlets</p>
                </div>
              </Link>
            </div>
          </section>

          {/* Motivation Quote */}
          <section className="border border-border rounded-[2rem] bg-brand-soft/60 p-6 space-y-4">
            <h3 className="font-display text-lg font-extrabold text-foreground flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-600" />
              Motivation
            </h3>
            <p className="text-xs font-semibold text-muted-foreground leading-relaxed">
              &ldquo;Learning never exhausts the mind.&rdquo; - Keep reviewing daily and watch your knowledge retention soar into long-term memory structures!
            </p>
          </section>
        </div>
      </div>

      {/* MANUAL DECK CREATION MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-6" onClick={() => setCreateModalOpen(false)}>
          <form
            onSubmit={handleCreateDeck}
            className="w-full max-w-md bg-card border border-border rounded-[2.5rem] p-6 space-y-6 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="font-display text-xl font-extrabold text-foreground">New Study Deck</h3>
              <p className="text-xs font-bold text-muted-foreground">Enter a name to create a manual deck slot</p>
            </div>

            <input
              type="text"
              required
              placeholder="e.g. AWS Cloud Associate, Cardiology 101..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full border border-border rounded-2xl px-4 py-3 bg-background font-semibold text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreateModalOpen(false);
                  setNewTitle("");
                }}
                className="flex-1 border border-border bg-background text-foreground font-extrabold text-sm py-3 rounded-2xl hover:bg-muted transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createDeckMutation.isPending || !newTitle.trim()}
                className="flex-1 flex items-center justify-center bg-primary text-primary-foreground font-extrabold text-sm py-3 rounded-2xl hover:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer"
              >
                {createDeckMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Slot"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
