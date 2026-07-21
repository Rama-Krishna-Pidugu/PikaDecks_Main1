import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Plus, Play, Edit3, Trash2, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { getDeckTint, getDeckEmoji } from "@/lib/theme";
import { useDecks, useCreateDeck } from "@/lib/queries";

export const Route = createFileRoute("/dashboard/decks")({
  component: DecksDirectoryPage,
});

function DecksDirectoryPage() {
  const router = useRouter();

  // TanStack Query — shares cache with dashboard home
  const decksQuery = useDecks();
  const createDeckMutation = useCreateDeck();

  const decks = decksQuery.data || [];
  const loading = decksQuery.isLoading;
  const error = decksQuery.error?.message || null;

  const [searchQuery, setSearchQuery] = useState("");

  // Manual deck modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await createDeckMutation.mutateAsync({
        title: newTitle.trim(),
        description: newDesc.trim() || "Manually created deck",
      });
      setCreateModalOpen(false);
      setNewTitle("");
      setNewDesc("");
    } catch (e: any) {
      alert(e?.message || "Could not create deck.");
    }
  };

  const filteredDecks = decks.filter((deck) =>
    deck.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (deck.description && deck.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-8 max-w-5xl mx-auto font-sans px-2 sm:px-4 pb-20">
      {/* Title & Actions Row */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-foreground tracking-tight">
            My Decks Catalog
          </h1>
          <p className="text-xs font-bold text-muted-foreground mt-1">
            {loading ? "Checking library..." : `${decks.length} study deck${decks.length === 1 ? "" : "s"} total`}
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center justify-center gap-2 btn-pop bg-brand-yellow text-brand-ink rounded-2xl px-5 py-3 text-sm font-extrabold hover:scale-[0.99] active:scale-[0.97] transition-transform cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4.5 w-4.5 stroke-[3]" />
          <span>NEW DECK</span>
        </button>
      </section>

      {/* Live Search Bar */}
      <section className="max-w-md">
        <div className="relative rounded-2xl border border-border bg-card px-4 py-3.5 flex items-center gap-3">
          <Search className="h-5 w-5 text-muted-foreground shrink-0 stroke-[2.5]" />
          <input
            type="text"
            placeholder="Search biology, GRE, AWS, physics decks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-sm font-semibold text-foreground placeholder-muted-foreground/60 focus:outline-none"
          />
        </div>
      </section>

      {/* Grid Decks Content: Responsive across phone, tablet, and desktop */}
      <section>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-36 bg-card border border-border/80 rounded-[2.25rem] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="border border-border rounded-[2.5rem] bg-rose-50/50 p-8 text-center max-w-lg mx-auto">
            <span className="text-3xl block mb-2">⚠️</span>
            <h3 className="font-display text-lg font-extrabold text-foreground">Failed to load library</h3>
            <p className="text-xs font-semibold text-muted-foreground mt-2 mb-4">{error}</p>
            <button
              onClick={() => void decksQuery.refetch()}
              className="border border-border bg-card text-xs font-extrabold px-6 py-2.5 rounded-xl cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredDecks.length === 0 ? (
          <div className="border border-dashed border-border rounded-[2.5rem] bg-card p-16 text-center max-w-lg mx-auto">
            <span className="text-4xl block mb-3">🃏</span>
            <h3 className="font-display text-xl font-extrabold text-foreground">No study decks found</h3>
            <p className="text-xs font-semibold text-muted-foreground mt-2 leading-relaxed">
              {searchQuery ? `No decks in your library match "${searchQuery}". Try a different term!` : "Your deck list is currently empty. Tap the + button to create a new slot manually or process a PDF."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
            {filteredDecks.map((deck, idx) => (
              <article
                key={deck.deck_id}
                className="group relative flex flex-col justify-between rounded-[2.25rem] border border-border bg-card p-6 hover:scale-[1.01] hover:border-primary/20 transition-all duration-200"
              >
                <div className="space-y-4">
                  {/* Category / Icon Row */}
                  <div className="flex items-center justify-between">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl border border-border ${getDeckTint(idx)} text-2xl`}>
                      {getDeckEmoji(idx)}
                    </div>
                  </div>

                  {/* Title & Desc */}
                  <div className="min-w-0">
                    <h3 className="pl-0.5 font-display text-base sm:text-lg font-extrabold leading-snug text-foreground transition-colors group-hover:text-primary">
                      <Link
                        to="/dashboard/deck/$deckId"
                        params={{ deckId: deck.deck_id }}
                        className="line-clamp-2 break-words"
                      >
                        {deck.title}
                      </Link>
                    </h3>
                    <p className="mt-2 text-xs text-muted-foreground font-semibold leading-relaxed line-clamp-2 pl-0.5">
                      {deck.description || "Interactive AI generated spaced repetition study deck."}
                    </p>
                  </div>
                </div>

                {/* Footer Action buttons */}
                <div className="mt-6 pt-4 border-t border-border/80 flex items-center justify-between pr-0.5">
                  <Link
                    to="/dashboard/deck/$deckId"
                    params={{ deckId: deck.deck_id }}
                    className="inline-flex items-center gap-1.5 text-xs font-extrabold text-primary hover:underline"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Manage Deck
                  </Link>

                  <Link
                    to="/dashboard/review/$deckId"
                    params={{ deckId: deck.deck_id }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand text-brand-foreground px-4 py-2 text-xs font-extrabold hover:scale-[0.98] transition-transform"
                  >
                    <Play className="h-3 w-3 fill-current stroke-[3]" />
                    Review Cards
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* CREATE MANUAL DECK MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-6" onClick={() => setCreateModalOpen(false)}>
          <form
            onSubmit={handleCreateDeck}
            className="w-full max-w-md bg-card border border-border rounded-[2.5rem] p-6 space-y-6 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="font-display text-xl font-extrabold text-foreground">New Study Deck</h3>
              <p className="text-xs font-bold text-muted-foreground">Configure your manual flashcard deck</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest pl-1">Deck Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AWS Solutions Architect S3"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full border border-border rounded-2xl px-4 py-3 bg-background font-semibold text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest pl-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. EC2 volumes, scaling policies..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full border border-border rounded-2xl px-4 py-3 bg-background font-semibold text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreateModalOpen(false);
                  setNewTitle("");
                  setNewDesc("");
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
                {createDeckMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Deck"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
