import { motion } from "framer-motion";
import { Play, Sparkles } from "lucide-react";
import appStoreBadge from "../../../AppIcons/appstore.png";
import playStoreBadge from "../../../AppIcons/playstore.png";
import mascot from "@/assets/studytime.png";

const cards = [
  { top: "8%", left: "4%", r: -8, text: "Mitochondria = ?", color: "bg-white" },
  { top: "18%", right: "6%", r: 10, text: "포도 → grape", color: "bg-brand-yellow" },
  { top: "55%", left: "2%", r: 6, text: "f(x) = x² + 1", color: "bg-white" },
  { top: "62%", right: "3%", r: -7, text: "Battle of 1066", color: "bg-white" },
  { top: "78%", left: "20%", r: 4, text: "useEffect()", color: "bg-brand-yellow" },
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-4 pt-12 pb-24 md:pt-20 md:pb-32">
      <div className="absolute inset-0 bg-radial-yellow" aria-hidden />
      <div className="absolute inset-0 bg-grid opacity-50" aria-hidden />

      {/* Floating flashcards */}
      {cards.map((c, i) => (
        <div
          key={i}
          className={`pointer-events-none absolute hidden md:block ${c.color} rounded-2xl border-2 border-foreground px-4 py-3 shadow-pop animate-float`}
          style={{
            top: c.top,
            left: c.left,
            right: c.right,
            // @ts-expect-error css var
            "--r": `${c.r}deg`,
            transform: `rotate(${c.r}deg)`,
            animationDelay: `${i * 0.6}s`,
          }}
        >
          <p className="font-display text-sm font-bold text-foreground">{c.text}</p>
        </div>
      ))}

      <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-foreground/10 bg-card/80 px-4 py-1.5 text-xs font-semibold backdrop-blur"
        >
          <Sparkles className="h-3.5 w-3.5 text-brand-red" />
          New · AI Study Assistant with MCP
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, type: "spring" }}
          className="relative mb-2"
        >
          <img
            src={mascot}
            alt="Pikadecks mascot"
            width={220}
            height={220}
            className="h-44 w-44 md:h-56 md:w-56 drop-shadow-[0_20px_30px_rgba(0,0,0,0.15)]"
          />
          <div className="absolute -inset-6 -z-10 animate-pulse-glow rounded-full" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="font-display text-5xl font-bold leading-[0.95] tracking-tight text-balance md:text-7xl lg:text-8xl"
        >
          Remember <span className="relative inline-block">
            Anything
            <span className="absolute -bottom-2 left-0 right-0 h-3 -z-10 bg-brand-yellow rounded-full" />
          </span> <br className="hidden md:block" /> With <span className="text-brand-red">Pikadecks.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.6 }}
          className="mt-6 max-w-2xl text-balance text-base text-muted-foreground md:text-lg"
        >
          Turn PDFs, YouTube videos, notes, and websites into smart flashcards instantly. Your AI-powered second brain for school, work, and life.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
        >
          <a href="/login" className="btn-pop glow-yellow inline-flex items-center gap-2 rounded-2xl bg-brand-yellow px-6 py-3.5 text-base font-bold text-brand-ink">
            Get Started Free
            <Sparkles className="h-4 w-4" />
          </a>
          <a href="#how" className="btn-pop inline-flex items-center gap-2 rounded-2xl bg-card px-6 py-3.5 text-base font-bold text-foreground">
            <Play className="h-4 w-4 fill-current" />
            Watch Demo
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-4"
        >
          <a
            href="https://play.google.com/store/apps/details?id=com.nameisrk.pikadecks"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-90 transition-opacity"
          >
            <img
              src={playStoreBadge}
              alt="Get it on Google Play"
              className="h-10 w-auto"
            />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
