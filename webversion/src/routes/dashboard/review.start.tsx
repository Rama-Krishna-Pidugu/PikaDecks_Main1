import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Play, Flame, Clock, Check, List, Shuffle, Loader2, ArrowLeft } from "lucide-react";
import { useDecks, useStats } from "@/lib/queries";
import { getDeckTint, getDeckEmoji } from "@/lib/theme";

export const Route = createFileRoute("/dashboard/review/start")({
  component: StartReviewPage,
});

const CACHE_KEY_DECKS = "pikadecks:review_selected_decks";
const CACHE_KEY_ORDER = "pikadecks:review_order";

function StartReviewPage() {
  const router = useRouter();
  const decksQuery = useDecks();
  const statsQuery = useStats();

  const decks = decksQuery.data || [];
  const stats = statsQuery.data;

  const [selectedDecks, setSelectedDecks] = useState<Record<string, boolean>>({});
  const [reviewOrder, setReviewOrder] = useState<"sequential" | "shuffle">("shuffle");
  const [cacheLoaded, setCacheLoaded] = useState(false);

  // Load cached settings
  useEffect(() => {
    try {
      const cachedDecks = localStorage.getItem(CACHE_KEY_DECKS);
      const cachedOrder = localStorage.getItem(CACHE_KEY_ORDER);

      if (cachedOrder === "sequential" || cachedOrder === "shuffle") {
        setReviewOrder(cachedOrder);
      }

      if (cachedDecks) {
        setSelectedDecks(JSON.parse(cachedDecks));
      } else if (decks.length > 0) {
        const initialSelection: Record<string, boolean> = {};
        decks.forEach((d) => {
          initialSelection[d.deck_id] = true;
        });
        setSelectedDecks(initialSelection);
      }
    } catch (e) {
      // Fallback
    } finally {
      setCacheLoaded(true);
    }
  }, [decks]);

  // Keep selectedDecks up to date if new decks are created
  useEffect(() => {
    if (cacheLoaded && decks.length > 0) {
      let changed = false;
      const updated = { ...selectedDecks };
      decks.forEach((d) => {
        if (updated[d.deck_id] === undefined) {
          updated[d.deck_id] = true;
          changed = true;
        }
      });
      if (changed) {
        setSelectedDecks(updated);
        localStorage.setItem(CACHE_KEY_DECKS, JSON.stringify(updated));
      }
    }
  }, [decks, cacheLoaded]);

  const toggleDeck = (deckId: string) => {
    const updated = { ...selectedDecks, [deckId]: !selectedDecks[deckId] };
    setSelectedDecks(updated);
    localStorage.setItem(CACHE_KEY_DECKS, JSON.stringify(updated));
  };

  const handleSetOrder = (order: "sequential" | "shuffle") => {
    setReviewOrder(order);
    localStorage.setItem(CACHE_KEY_ORDER, order);
  };

  const toggleSelectAll = () => {
    const allSelected = decks.every((d) => selectedDecks[d.deck_id]);
    const updated: Record<string, boolean> = {};
    decks.forEach((d) => {
      updated[d.deck_id] = !allSelected;
    });
    setSelectedDecks(updated);
    localStorage.setItem(CACHE_KEY_DECKS, JSON.stringify(updated));
  };

  const breakdown = (stats as any)?.decks_breakdown || {};

  // Compute session overview statistics
  const sessionStats = useMemo(() => {
    let due = 0;
    let overdue = 0;
    let newCards = 0;
    let total = 0;

    decks.forEach((d) => {
      if (selectedDecks[d.deck_id]) {
        const deckBreakdown = breakdown[d.deck_id] || { due: 0, overdue: 0, new: 0, total: 0 };
        due += deckBreakdown.due || 0;
        overdue += deckBreakdown.overdue || 0;
        newCards += deckBreakdown.new || 0;
        total += deckBreakdown.total || 0;
      }
    });

    const totalSessionCards = due > 0 ? due : total;
    const estMinutes = totalSessionCards > 0 ? Math.max(1, Math.round(totalSessionCards * 0.25)) : 0;

    return { due, overdue, newCards, total: totalSessionCards, estMinutes };
  }, [decks, selectedDecks, breakdown]);

  const selectedCount = decks.filter((d) => selectedDecks[d.deck_id]).length;

  const handleStartReview = () => {
    const activeDeckIds = decks
      .filter((d) => selectedDecks[d.deck_id])
      .map((d) => d.deck_id);

    if (activeDeckIds.length === 0) return;

    router.navigate({
      to: "/dashboard/review/$deckId",
      params: { deckId: activeDeckIds.join(",") },
      search: {
        limit: sessionStats.total,
        order: reviewOrder,
      },
    });
  };

  const loading = decksQuery.isLoading || statsQuery.isLoading || !cacheLoaded;

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-bold text-muted-foreground">Preparing review session...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto font-sans pb-24 px-2 sm:px-4">
      {/* Header section */}
      <section className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Link
            to="/dashboard"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-card hover:scale-[1.05] active:scale-[0.95] transition-all cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5 stroke-[2.5]" />
          </Link>
          <div>
            <h1 className="font-display text-3xl font-extrabold text-foreground tracking-tight">
              Start Review
            </h1>
            <p className="text-muted-foreground font-semibold text-sm mt-1">
              Pick the decks you want to study now.
            </p>
          </div>
        </div>

        {/* Streak indicator */}
        <Link
          to="/dashboard/streak"
          className="flex items-center gap-2.5 bg-card border border-border px-4 py-2.5 rounded-2xl shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer hover:border-orange-200"
        >
          <Flame className="h-5 w-5 text-orange-500 fill-current" />
          <span className="text-sm font-extrabold text-foreground">
            {stats?.current_streak || 0}
          </span>
        </Link>
      </section>

      {/* Main configuration Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Decks and Order config */}
        <div className="lg:col-span-2 space-y-8">
          {/* Review Order Segment */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-extrabold text-muted-foreground tracking-widest uppercase pl-1">
              REVIEW ORDER
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => handleSetOrder("sequential")}
                className={`flex flex-col items-start text-left border rounded-[2rem] p-6 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 group cursor-pointer space-y-4 shadow-sm ${
                  reviewOrder === "sequential"
                    ? "border-primary bg-primary/[0.02]"
                    : "border-border bg-card"
                }`}
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors ${
                  reviewOrder === "sequential"
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-border bg-muted/20 text-muted-foreground"
                }`}>
                  <List className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-foreground">Sequential</h4>
                  <p className="text-xs font-semibold text-muted-foreground mt-1 leading-relaxed">
                    Deck by deck, in order.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSetOrder("shuffle")}
                className={`flex flex-col items-start text-left border rounded-[2rem] p-6 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 group cursor-pointer space-y-4 shadow-sm ${
                  reviewOrder === "shuffle"
                    ? "border-primary bg-primary/[0.02]"
                    : "border-border bg-card"
                }`}
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors ${
                  reviewOrder === "shuffle"
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-border bg-muted/20 text-muted-foreground"
                }`}>
                  <Shuffle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-foreground">Shuffle</h4>
                  <p className="text-xs font-semibold text-muted-foreground mt-1 leading-relaxed">
                    Remix all cards.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Deck List Selector */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/80 pb-2">
              <h3 className="text-[10px] font-extrabold text-muted-foreground tracking-widest uppercase pl-1">
                DECKS • {selectedCount}/{decks.length}
              </h3>
              <button
                onClick={toggleSelectAll}
                className="text-xs font-extrabold text-primary hover:underline cursor-pointer"
              >
                {decks.every((d) => selectedDecks[d.deck_id]) ? "Deselect all" : "Select all"}
              </button>
            </div>

            <div className="space-y-3">
              {decks.map((deck, idx) => {
                const isSelected = !!selectedDecks[deck.deck_id];
                const statsInfo = breakdown[deck.deck_id] || { due: 0, overdue: 0, new: 0 };
                return (
                  <button
                    key={deck.deck_id}
                    onClick={() => toggleDeck(deck.deck_id)}
                    className={`w-full flex items-center justify-between border rounded-3xl p-4 bg-card hover:scale-[1.002] transition-all shadow-sm ${
                      isSelected ? "border-primary/50" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border ${getDeckTint(idx)} text-2xl`}>
                        {getDeckEmoji(idx)}
                      </div>
                      <div className="text-left min-w-0">
                        <h4 className="line-clamp-1 text-sm md:text-base font-extrabold text-foreground leading-snug">
                          {deck.title}
                        </h4>
                        <p className="text-[11px] font-semibold text-muted-foreground leading-none mt-2">
                          {statsInfo.due} due  •  {statsInfo.overdue} overdue{statsInfo.new > 0 ? `  •  ${statsInfo.new} new` : ""}
                        </p>
                      </div>
                    </div>

                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected ? "bg-primary border-primary text-white" : "border-muted-foreground/30"
                    }`}>
                      {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Sticky Overview Session Panel */}
        <div className="space-y-6">
          <div className="border border-border bg-card rounded-[2rem] p-6 space-y-6 shadow-md sticky top-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display text-4xl font-black text-foreground">
                  {sessionStats.total}
                </h3>
                <p className="text-xs font-bold text-muted-foreground mt-1">
                  cards in this session
                </p>
              </div>
              {sessionStats.estMinutes > 0 && (
                <div className="flex items-center gap-1.5 bg-muted/40 border border-border/10 px-2.5 py-1.5 rounded-xl">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-bold text-muted-foreground">
                    ~{sessionStats.estMinutes} min
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl py-3 text-center">
                <span className="text-lg font-black text-primary block">{sessionStats.due}</span>
                <span className="text-[9px] font-extrabold text-muted-foreground tracking-wider uppercase block mt-1">Due</span>
              </div>
              <div className="bg-amber-50/50 border border-amber-100/50 rounded-2xl py-3 text-center">
                <span className="text-lg font-black text-amber-600 block">{sessionStats.overdue}</span>
                <span className="text-[9px] font-extrabold text-muted-foreground tracking-wider uppercase block mt-1">Overdue</span>
              </div>
              <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-2xl py-3 text-center">
                <span className="text-lg font-black text-emerald-600 block">{sessionStats.newCards}</span>
                <span className="text-[9px] font-extrabold text-muted-foreground tracking-wider uppercase block mt-1">New</span>
              </div>
            </div>

            <button
              onClick={handleStartReview}
              disabled={selectedCount === 0 || sessionStats.total === 0}
              className="w-full bg-primary text-primary-foreground font-display font-extrabold py-4 rounded-2xl flex items-center justify-center gap-2 hover:scale-[0.98] transition-transform shadow-sm disabled:opacity-50 disabled:pointer-events-none"
            >
              <Play className="h-4.5 w-4.5 fill-current" />
              <span>Start Review Session</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
