import { createFileRoute, Link, useRouter, useParams } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { X, RotateCcw, RefreshCw, Loader2, ArrowLeft, ArrowRight, HelpCircle, Maximize2, Minimize2 } from "lucide-react";
import { useDeckDetail, useReviewSession, useSubmitReview, type Card } from "@/lib/queries";
import { MathText } from "@/components/MathText";

type ReviewSearchParams = {
  limit?: number;
  order?: "sequential" | "shuffle";
};

export const Route = createFileRoute("/dashboard/review/$deckId")({
  validateSearch: (search: Record<string, unknown>): ReviewSearchParams => {
    return {
      limit: search.limit ? Number(search.limit) : undefined,
      order: search.order === "sequential" || search.order === "shuffle" ? search.order : undefined,
    };
  },
  component: ReviewPage,
});

const RATINGS = [
  {
    key: "again",
    shortcut: "1",
    label: "Again",
    hint: "I forgot",
    color: "text-rose-600 bg-rose-50/50 border-rose-200 hover:bg-rose-100/60 active:bg-rose-200/60",
    circleColor: "border-rose-300 text-rose-600 animate-pulse"
  },
  {
    key: "hard",
    shortcut: "2",
    label: "Hard",
    hint: "Difficult",
    color: "text-amber-600 bg-amber-50/50 border-amber-200 hover:bg-amber-100/60 active:bg-amber-200/60",
    circleColor: "border-amber-300 text-amber-600"
  },
  {
    key: "good",
    shortcut: "3",
    label: "Good",
    hint: "Got it",
    color: "text-emerald-600 bg-emerald-50/50 border-emerald-200 hover:bg-emerald-100/60 active:bg-emerald-200/60",
    circleColor: "border-emerald-300 text-emerald-600"
  },
  {
    key: "easy",
    shortcut: "4",
    label: "Easy",
    hint: "Very easy",
    color: "text-indigo-600 bg-indigo-50/50 border-indigo-200 hover:bg-indigo-100/60 active:bg-indigo-200/60",
    circleColor: "border-indigo-300 text-indigo-600"
  },
];

function ExpandableImage({ src, alt }: { src: string; alt: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <button 
        type="button" 
        onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
        className="w-full max-w-sm mx-auto rounded-2xl overflow-hidden border border-border/50 shadow-sm hover:ring-2 ring-primary/50 transition-all focus:outline-none cursor-zoom-in bg-muted/10 group"
      >
        <img src={src} alt={alt} className="w-full h-auto object-contain max-h-48 md:max-h-64 group-hover:opacity-90 transition-opacity" />
      </button>

      {isExpanded && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 sm:p-8 cursor-zoom-out backdrop-blur-sm animate-fade-in"
          onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
        >
          <img 
            src={src} 
            alt={alt} 
            className="w-full h-full object-contain drop-shadow-2xl animate-in zoom-in-95 duration-200" 
          />
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
            className="absolute top-4 right-4 sm:top-8 sm:right-8 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-md transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </>
  );
}

function ReviewPage() {
  const { deckId } = useParams({ from: "/dashboard/review/$deckId" });
  const { limit, order } = Route.useSearch();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // TanStack Query hooks
  const deckQuery = useDeckDetail(deckId);
  const sessionQuery = useReviewSession(deckId, limit, order);
  const submitReviewMutation = useSubmitReview();

  const loading = deckQuery.isLoading || sessionQuery.isLoading;
  const error = deckQuery.error?.message || sessionQuery.error?.message || null;

  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedIndex, setSavedIndex] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Touch Swipe gesture states
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  // Device detection
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isMobileUA || isSmallScreen);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Sync state with browser Fullscreen API
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else {
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed. Graceful layout fallback activated:", err);
      setIsFullscreen((prev) => !prev);
    }
  };

  // Initialize cards from query data (runs once when data arrives)
  useEffect(() => {
    if (initialized || !sessionQuery.data) return;
    const loadedCards = sessionQuery.data;

    const progressKey = `deck_progress_${deckId}`;
    const savedIdxVal = localStorage.getItem(progressKey);
    const savedIdx = savedIdxVal ? parseInt(savedIdxVal, 10) : 0;

    if (savedIdx > 0 && savedIdx < loadedCards.length) {
      setSavedIndex(savedIdx);
      setCards(loadedCards);
      setShowResumePrompt(true);
    } else {
      const finalCards = order === "shuffle"
        ? [...loadedCards].sort(() => Math.random() - 0.5)
        : loadedCards;
      setCards(finalCards);
      localStorage.setItem(progressKey, "0");
    }
    setInitialized(true);
  }, [sessionQuery.data, deckId, initialized, order]);

  const handleStartOver = () => {
    const loadedCards = sessionQuery.data || [];
    const finalCards = order === "shuffle"
      ? [...loadedCards].sort(() => Math.random() - 0.5)
      : loadedCards;
    setCards(finalCards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowResumePrompt(false);
    localStorage.setItem(`deck_progress_${deckId}`, "0");
  };

  const handleResumeSession = () => {
    setCurrentIndex(savedIndex);
    setIsFlipped(false);
    setShowResumePrompt(false);
  };

  const handleFlipCard = () => {
    setIsFlipped(!isFlipped);
  };

  const handleRateCard = useCallback(async (rating: string) => {
    if (cards.length === 0) return;
    const currentCard = cards[currentIndex];

    // Fire-and-forget review submission via mutation
    submitReviewMutation.mutate({
      cardId: currentCard.card_id,
      deckId,
      rating,
    });

    // Proceed to next card or complete session
    if (currentIndex >= cards.length - 1) {
      setSessionCompleted(true);
      localStorage.removeItem(`deck_progress_${deckId}`);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } else {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setIsFlipped(false);
      localStorage.setItem(`deck_progress_${deckId}`, String(nextIdx));
    }
  }, [cards, currentIndex, deckId, submitReviewMutation]);

  const handlePrevCard = useCallback(() => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      setIsFlipped(false);
      localStorage.setItem(`deck_progress_${deckId}`, String(prevIdx));
    }
  }, [currentIndex, deckId]);

  const handleNextCard = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setIsFlipped(false);
      localStorage.setItem(`deck_progress_${deckId}`, String(nextIdx));
    }
  }, [currentIndex, cards.length, deckId]);

  // Keyboard Shortcuts Hook
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showResumePrompt || sessionCompleted || cards.length === 0) return;

      if (e.code === "Space") {
        e.preventDefault();
        handleFlipCard();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlePrevCard();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleNextCard();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        void toggleFullscreen();
      } else if (isFlipped) {
        if (e.key === "1") void handleRateCard("again");
        else if (e.key === "2") void handleRateCard("hard");
        else if (e.key === "3") void handleRateCard("good");
        else if (e.key === "4") void handleRateCard("easy");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showResumePrompt, sessionCompleted, cards, isFlipped, handleRateCard, handlePrevCard, handleNextCard]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || cards.length === 0) {
    return (
      <div className="border border-border rounded-[2.5rem] bg-card p-12 text-center max-w-lg mx-auto mt-12">
        <span className="text-4xl block mb-2">💤</span>
        <h3 className="font-display text-xl font-extrabold text-foreground">No cards to review</h3>
        <p className="text-xs font-semibold text-muted-foreground mt-2 mb-6">
          {error || "Add some flashcards to this deck to start learning!"}
        </p>
        <Link
          to="/dashboard/deck/$deckId"
          params={{ deckId }}
          className="bg-brand text-brand-foreground text-xs font-extrabold px-6 py-3 rounded-2xl hover:scale-[0.98] transition-transform"
        >
          Go Back
        </Link>
      </div>
    );
  }

  // 1. Session Complete Screen
  if (sessionCompleted) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4 font-sans animate-fade-in">
        <div className="w-full max-w-md border border-border bg-card rounded-[2.5rem] p-8 text-center">
          <div className="mb-4 text-6xl animate-bounce">🎉</div>
          <h2 className="font-display text-2xl md:text-3xl font-extrabold text-foreground">All done!</h2>
          <p className="text-sm font-semibold text-muted-foreground mt-2 leading-relaxed">
            You successfully studied <strong className="font-extrabold text-primary">{cards.length}</strong> card{cards.length === 1 ? "" : "s"} inside this deck slot. Great memory training!
          </p>

          <div className="my-6 border-t border-border/80 pt-6 space-y-4">
            <Link
              to="/dashboard/deck/$deckId"
              params={{ deckId }}
              className="w-full flex items-center justify-center bg-primary text-primary-foreground font-extrabold text-sm py-3.5 rounded-2xl hover:scale-[0.98] transition-transform cursor-pointer"
            >
              Back to Deck Manager
            </Link>

            <button
              onClick={() => {
                setSessionCompleted(false);
                handleStartOver();
              }}
              className="w-full flex items-center justify-center gap-1.5 border border-border bg-background text-foreground font-extrabold text-sm py-3.5 rounded-2xl hover:bg-muted transition-colors cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Review Again</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Session Resumption Prompt
  if (showResumePrompt) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4 font-sans animate-fade-in">
        <div className="w-full max-w-md border border-border bg-card rounded-[2.5rem] p-8 text-center space-y-6">
          <div className="text-5xl">🤔</div>
          <div className="space-y-2">
            <h3 className="font-display text-xl md:text-2xl font-extrabold text-foreground">Resume Session?</h3>
            <p className="text-xs md:text-sm font-semibold text-muted-foreground leading-relaxed">
              You previously studied up to card <strong className="font-extrabold text-primary">{savedIndex + 1}</strong> of <strong className="font-bold">{cards.length}</strong>. Would you like to resume or start over?
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleResumeSession}
              className="w-full bg-primary text-primary-foreground font-extrabold text-sm py-3.5 rounded-2xl hover:scale-[0.98] transition-transform cursor-pointer"
            >
              Continue Session
            </button>
            <button
              onClick={handleStartOver}
              className="w-full border border-border bg-background text-foreground font-extrabold text-sm py-3.5 rounded-2xl hover:bg-muted transition-colors cursor-pointer"
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }



  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // Horizontal swipe prioritisation
    if (Math.abs(diffX) > Math.abs(diffY)) {
      if (e.cancelable) {
        e.preventDefault();
      }
      setSwipeOffset(diffX);
    }
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null) return;
    const threshold = 100;

    if (swipeOffset > threshold) {
      // Swipe Right
      if (isFlipped) {
        setIsFlipped(false);
      } else {
        handlePrevCard();
      }
    } else if (swipeOffset < -threshold) {
      // Swipe Left
      if (isFlipped) {
        void handleRateCard("good");
      } else {
        handleNextCard();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
    setSwipeOffset(0);
    setIsSwiping(false);
  };

  const currentCard = cards[currentIndex];
  const progressPercent = ((currentIndex + 1) / cards.length) * 100;

  // Touch gesture transform style
  const gestureStyle = isSwiping
    ? {
        transform: `translateX(${swipeOffset}px) rotate(${swipeOffset * 0.05}deg)`,
        transition: "none",
      }
    : {
        transform: "translateX(0px) rotate(0deg)",
        transition: "transform 0.3s ease-out",
      };

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-50 bg-background flex flex-col h-screen w-screen p-4 sm:p-6 md:p-8 animate-fade-in font-sans overflow-hidden justify-between items-center"
          : "max-w-4xl mx-auto flex flex-col h-[calc(100vh-80px)] min-h-[500px] max-h-[calc(100vh-80px)] font-sans px-2 sm:px-4 py-4 justify-between overflow-hidden items-center w-full"
      }
    >
      {/* Top Header Layout - Immersive & minimal */}
      <header className="flex w-full items-center justify-between gap-4 shrink-0 py-2 border-b border-border/40">
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/dashboard/deck/$deckId"
            params={{ deckId }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-card hover:scale-[1.05] transition-all cursor-pointer"
          >
            <X className="h-5 w-5 stroke-[2.5]" />
          </Link>
          {isFullscreen && !isMobile && (
            <span className="hidden md:inline-flex items-center text-xs font-extrabold text-muted-foreground uppercase tracking-widest gap-1">
              Exit <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-sm">Esc</kbd>
            </span>
          )}
        </div>

        {/* Simplified Progress */}
        <div className="flex-1 max-w-md mx-auto flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden border border-border/10">
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full bg-primary rounded-full transition-all duration-300"
            />
          </div>
          <span className="text-xs font-extrabold text-foreground tracking-wider whitespace-nowrap">
            {currentIndex + 1} / {cards.length}
          </span>
        </div>

        {/* Utilities: Help / Fullscreen Trigger */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-card hover:scale-[1.05] transition-all cursor-pointer text-muted-foreground hover:text-foreground"
            aria-label="View help and shortcuts"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
          
          {!isMobile && (
            <span className="hidden md:inline-flex items-center text-xs font-extrabold text-muted-foreground uppercase tracking-widest gap-1">
              Fullscreen <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-sm">F</kbd>
            </span>
          )}
          
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-card hover:scale-[1.05] transition-all cursor-pointer"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Primary Card Viewport - Fixed aspects and stable height container */}
      <main className="flex-1 w-full min-h-0 flex items-center justify-center py-4 relative">
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={gestureStyle}
          className={
            isFullscreen
              ? "relative group w-[85vw] min-h-[60vh] max-h-[85vh] max-w-5xl flex flex-col justify-between rounded-[2.5rem] border border-border bg-card shadow-lg overflow-hidden"
              : "relative group w-full min-h-[500px] h-[60vh] md:h-[70vh] max-h-[85vh] max-w-4xl flex flex-col justify-between rounded-[2.5rem] border border-border bg-card shadow-lg overflow-hidden"
          }
        >
          {/* Card Main Content Area */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 md:p-14 select-none flex flex-col">
            {!isFlipped ? (
              // Front Face content
              <div className={`flex-1 w-full ${!isMobile && currentCard.image_url ? 'grid grid-cols-2 gap-8 items-center text-left' : 'flex flex-col justify-center text-center'}`}>
                
                <div className="animate-fade-in space-y-4 flex flex-col justify-center">
                  <span className="text-[10px] font-extrabold text-primary tracking-widest uppercase block">
                    QUESTION
                  </span>
                  <div
                    className={`font-display font-extrabold text-foreground leading-snug tracking-tight ${
                      isFullscreen ? "text-xl sm:text-4xl" : "text-lg sm:text-3xl"
                    }`}
                  >
                    <MathText text={currentCard.question} />
                  </div>
                </div>

                {currentCard.image_url && (
                  <div className={`animate-fade-in flex items-center justify-center ${isMobile ? 'mt-8' : ''}`}>
                    <ExpandableImage src={currentCard.image_url} alt="Question context" />
                  </div>
                )}
              </div>
            ) : (
              // Back Face content
              <div className={`flex-1 w-full ${!isMobile && (currentCard.image_url || currentCard.notes_image_url) ? 'grid grid-cols-2 gap-10 items-center text-left' : 'flex flex-col justify-center text-center'}`}>
                
                <div className="animate-fade-in space-y-8 flex flex-col justify-center">
                  <div className="space-y-3">
                    <span className="text-[10px] font-extrabold text-emerald-500 tracking-widest uppercase block">
                      ANSWER
                    </span>
                    <div
                      className={`font-display font-extrabold text-foreground leading-snug tracking-tight ${
                        isFullscreen ? "text-lg sm:text-3xl" : "text-base sm:text-2xl"
                      }`}
                    >
                      <MathText text={currentCard.answer} />
                    </div>
                  </div>

                  {currentCard.explanation && (
                    <div className="border-t border-border/60 pt-6 space-y-3">
                      <span className="text-[10px] font-extrabold text-amber-500 tracking-widest uppercase block">
                        EXPLANATION
                      </span>
                      <div
                        className={`font-medium text-muted-foreground leading-relaxed ${
                          isFullscreen ? "text-sm sm:text-base" : "text-sm"
                        }`}
                      >
                        <MathText text={currentCard.explanation} />
                      </div>
                    </div>
                  )}
                </div>

                {(currentCard.image_url || currentCard.notes_image_url) && (
                  <div className={`animate-fade-in flex flex-col gap-6 items-center justify-center ${isMobile ? 'mt-8' : ''}`}>
                    {currentCard.image_url && (
                      <ExpandableImage src={currentCard.image_url} alt="Question context" />
                    )}
                    {currentCard.notes_image_url && (
                      <ExpandableImage src={currentCard.notes_image_url} alt="Explanation context" />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Integrated Docked Footer inside Card Container (Visual Stability) */}
          <div className="border-t border-border/50 bg-muted/5 px-6 py-5 flex flex-col items-stretch shrink-0 backdrop-blur-sm">
            {!isFlipped ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFlipCard();
                }}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-extrabold text-sm sm:text-base hover:scale-[0.99] transition-all cursor-pointer shadow-sm"
              >
                Reveal Answer
              </button>
            ) : (
              <div className="space-y-3">
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest block text-center">
                  How well did you remember?
                </span>
                <div className="grid grid-cols-4 gap-2 sm:gap-4">
                  {RATINGS.map((item) => (
                    <button
                      key={item.key}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRateCard(item.key);
                      }}
                      className={`flex min-h-[4rem] sm:min-h-[5rem] flex-col items-center justify-center border rounded-xl py-2 px-1 text-xs font-extrabold hover:scale-[0.98] transition-transform cursor-pointer ${item.color}`}
                    >
                      <span className="text-xs sm:text-sm font-extrabold">{item.label}</span>
                      <span className="text-[8px] sm:text-[9px] font-bold opacity-75 hidden xs:inline mt-0.5">{item.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Navigation / Fallback Controls Section */}
      <footer className="w-full shrink-0 pt-2 pb-4 max-w-3xl flex flex-row items-center justify-between gap-4">
        <div>
          {/* Mobile indicator / Help guide */}
          {isMobile ? (
            <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
              👈 Swipe to navigate / rate
            </span>
          ) : (
            <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <span>Shortcuts:</span>
              <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-xs">Space</kbd> Flip
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrevCard();
            }}
            disabled={currentIndex === 0}
            className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-extrabold disabled:opacity-40 disabled:pointer-events-none cursor-pointer hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNextCard();
            }}
            disabled={currentIndex === cards.length - 1}
            className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-extrabold disabled:opacity-40 disabled:pointer-events-none cursor-pointer hover:bg-muted"
          >
            <span className="hidden sm:inline">Next</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>

      {/* Minimalist Controls and Help Shortcuts Modal */}
      {showHelp && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="w-full max-w-sm border border-border bg-card rounded-[2rem] p-6 shadow-xl space-y-4 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="font-display text-lg font-extrabold text-foreground">Study Controls</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground hover:bg-muted/80 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="space-y-4 text-xs font-semibold text-muted-foreground leading-relaxed">
              {!isMobile && (
                <div className="space-y-2.5">
                  <p className="font-bold text-foreground">Keyboard Shortcuts</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-1.5"><kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-xs">Space</kbd> Flip Card</div>
                    <div className="flex items-center gap-1.5"><kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-xs">F</kbd> Fullscreen</div>
                    <div className="flex items-center gap-1.5"><kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-xs">1</kbd> Rate Again</div>
                    <div className="flex items-center gap-1.5"><kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-xs">2</kbd> Rate Hard</div>
                    <div className="flex items-center gap-1.5"><kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-xs">3</kbd> Rate Good</div>
                    <div className="flex items-center gap-1.5"><kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-xs">4</kbd> Rate Easy</div>
                    <div className="flex items-center gap-1.5"><kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-xs">←</kbd> Prev Card</div>
                    <div className="flex items-center gap-1.5"><kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[9px] font-mono shadow-xs">→</kbd> Next Card</div>
                  </div>
                </div>
              )}
              
              <div className="space-y-2 pt-2 border-t border-border/40">
                <p className="font-bold text-foreground">Mobile Swipe Gestures</p>
                <ul className="list-disc list-inside space-y-1.5">
                  <li>Swipe Left to rate <strong>Good</strong> (Answer state) or go <strong>Next</strong> (Question state).</li>
                  <li>Swipe Right to <strong>Flip Back</strong> (Answer state) or go <strong>Previous</strong> (Question state).</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
