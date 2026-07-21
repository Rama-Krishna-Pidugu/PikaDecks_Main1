import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Sparkles } from "lucide-react";

export interface Flashcard {
  front: string;
  back: string;
  hint?: string;
}

interface InteractiveCardsProps {
  cards: Flashcard[];
}

export function InteractiveCards({ cards }: InteractiveCardsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (!cards || cards.length === 0) {
    return null;
  }

  const currentCard = cards[currentIndex];

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % cards.length);
    }, 150);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
    }, 150);
  };

  return (
    <div className="mx-auto w-full max-w-md">
      {/* 3D Card Container */}
      <div
        className="group relative h-64 w-full cursor-pointer [perspective:1000px]"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div
          className={`relative h-full w-full rounded-3xl border-2 border-brand-ink bg-card transition-transform duration-500 [transform-style:preserve-3d] shadow-pop ${
            isFlipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* Front Face */}
          <div className="absolute inset-0 flex flex-col justify-between p-6 [backface-visibility:hidden]">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-brand-yellow/20 px-3 py-1 text-xs font-bold text-brand-ink dark:text-brand-yellow">
                Question
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Card {currentIndex + 1} of {cards.length}
              </span>
            </div>
            <div className="flex flex-grow items-center justify-center text-center">
              <p className="font-display text-xl font-bold leading-snug text-foreground md:text-2xl">
                {currentCard.front}
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-muted-foreground">
              <RotateCw className="h-3.5 w-3.5" />
              <span>Tap card to reveal answer</span>
            </div>
          </div>

          {/* Back Face */}
          <div className="absolute inset-0 flex flex-col justify-between p-6 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-brand-yellow/5 dark:bg-zinc-900/30">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-brand-red/20 px-3 py-1 text-xs font-bold text-brand-red">
                Answer
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Card {currentIndex + 1} of {cards.length}
              </span>
            </div>
            <div className="flex flex-grow flex-col items-center justify-center text-center p-2">
              <p className="font-display text-lg font-bold leading-relaxed text-foreground md:text-xl">
                {currentCard.back}
              </p>
              {currentCard.hint && (
                <p className="mt-2 text-xs text-muted-foreground italic">
                  💡 {currentCard.hint}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-brand-ink/75 dark:text-brand-yellow/75">
              <Sparkles className="h-3.5 w-3.5 text-brand-red" />
              <span>Click again to flip back</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="mt-6 flex items-center justify-between px-2">
        <button
          onClick={handlePrev}
          className="btn-pop flex h-10 w-10 items-center justify-center rounded-xl bg-card text-foreground"
          aria-label="Previous card"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="text-xs font-bold text-muted-foreground">
          Press space or tap card to flip
        </div>

        <button
          onClick={handleNext}
          className="btn-pop flex h-10 w-10 items-center justify-center rounded-xl bg-card text-foreground"
          aria-label="Next card"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
