import { ReactNode } from "react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { InteractiveCards, Flashcard } from "@/components/landing/InteractiveCards";
import { motion } from "framer-motion";
import { Sparkles, MessageSquare } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

interface SEOTemplateProps {
  badge: string;
  h1: string;
  subtitle: string;
  cards: Flashcard[];
  faq: FAQItem[];
  children?: ReactNode;
}

export function SEOTemplate({ badge, h1, subtitle, cards, faq, children }: SEOTemplateProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* Hero Header */}
      <section className="relative overflow-hidden px-4 pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="absolute inset-0 bg-radial-yellow" aria-hidden />
        <div className="absolute inset-0 bg-grid opacity-30" aria-hidden />

        <div className="relative mx-auto max-w-6xl grid gap-12 md:grid-cols-12 items-center">
          {/* Hero Copy */}
          <div className="md:col-span-7 space-y-6 text-center md:text-left">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground/10 bg-card/85 px-4 py-1.5 text-xs font-bold backdrop-blur"
            >
              <Sparkles className="h-3.5 w-3.5 text-brand-red" />
              <span className="text-foreground">{badge}</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance md:text-6xl lg:text-7xl text-foreground"
            >
              {h1}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="max-w-2xl text-balance text-base text-muted-foreground md:text-lg leading-relaxed"
            >
              {subtitle}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex justify-center md:justify-start gap-4 pt-2"
            >
              <a
                href="#cta"
                className="btn-pop glow-yellow inline-flex items-center gap-2 rounded-2xl bg-brand-yellow px-6 py-3 font-display text-base font-bold text-brand-ink"
              >
                Try PikaDecks Free
                <Sparkles className="h-4 w-4" />
              </a>
            </motion.div>
          </div>

          {/* Interactive Preview Widget */}
          <div className="md:col-span-5 flex justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, type: "spring" }}
              className="w-full"
            >
              <div className="relative rounded-[2rem] border-2 border-foreground bg-card p-6 shadow-soft">
                <div className="absolute -top-3 -right-3 rounded-xl border-2 border-brand-ink bg-brand-red px-3 py-1 text-xs font-bold text-white rotate-6">
                  Interactive Demo
                </div>
                <InteractiveCards cards={cards} />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Main Feature Content */}
      {children && (
        <section className="relative px-4 py-16 md:py-24 bg-card/50">
          <div className="mx-auto max-w-5xl">{children}</div>
        </section>
      )}

      {/* FAQ Section */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground/10 bg-muted px-4 py-1.5 text-xs font-bold">
              <MessageSquare className="h-3.5 w-3.5 text-brand-red" />
              <span>Questions & Answers</span>
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="rounded-2xl border-2 border-foreground/10 bg-card p-6 md:p-8 shadow-soft">
            <Accordion type="single" collapsible className="w-full">
              {faq.map((item, idx) => (
                <AccordionItem key={idx} value={`item-${idx}`} className="border-foreground/10 py-1">
                  <AccordionTrigger className="font-display text-base font-bold text-foreground hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm leading-relaxed pt-2">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <FinalCTA />
      <Footer />
    </main>
  );
}
