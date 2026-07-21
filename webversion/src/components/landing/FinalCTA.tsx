import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import mascot from "@/assets/mascot.png";

export function FinalCTA() {
  return (
    <section id="cta" className="px-4 py-20 md:py-28">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] border-2 border-foreground bg-brand-yellow p-10 text-center shadow-pop md:p-20">
        <div className="absolute inset-0 bg-grid opacity-30" aria-hidden />
        <motion.img
          src={mascot}
          alt=""
          aria-hidden
          width={160}
          height={160}
          loading="lazy"
          className="absolute -left-6 -top-6 h-28 -rotate-12 md:h-40"
          initial={{ rotate: -20, opacity: 0 }}
          whileInView={{ rotate: -12, opacity: 1 }}
          viewport={{ once: true }}
        />
        <motion.img
          src={mascot}
          alt=""
          aria-hidden
          width={160}
          height={160}
          loading="lazy"
          className="absolute -bottom-6 -right-6 h-28 rotate-12 scale-x-[-1] md:h-40"
          initial={{ rotate: 20, opacity: 0 }}
          whileInView={{ rotate: 12, opacity: 1 }}
          viewport={{ once: true }}
        />
        <div className="relative">
          <h2 className="font-display text-5xl font-bold tracking-tight text-balance text-foreground md:text-7xl">
            Your second brain <br /> for learning.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-foreground/80">
            Free forever. Pro when you're ready. Join 10,000+ students learning smarter every day.
          </p>
          <a href="/login" className="btn-pop glow-red mt-8 inline-flex items-center gap-2 rounded-2xl bg-brand-red px-8 py-4 font-display text-lg font-bold text-white">
            Start Learning Smarter
            <Sparkles className="h-5 w-5" />
          </a>
        </div>
      </div>
    </section>
  );
}
