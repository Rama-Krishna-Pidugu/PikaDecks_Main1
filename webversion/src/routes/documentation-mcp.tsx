import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Clipboard, CheckCircle2, Shield, Lock, Database } from "lucide-react";
import { motion } from "framer-motion";

import chatGptLogoImg from "@/assets/Pika/icons8-chatgpt-100.png";
import claudeLogoImg from "@/assets/Pika/icons8-claude-ai-96.png";
import pikadecksLogoImg from "@/assets/Pika/superpika.PNG";

export const Route = createFileRoute("/documentation-mcp")({
  head: () => ({
    meta: [
      { title: "PikaDecks MCP — Connect Flashcards to ChatGPT & Claude" },
      { name: "description", content: "Access your PikaDecks flashcard library directly from ChatGPT and Claude using the Model Context Protocol (MCP)." },
    ],
  }),
  component: McpLandingPage,
});

const ChatGptLogo = ({ className = "w-8 h-8", white = false }: { className?: string; white?: boolean }) => (
  <img
    src={chatGptLogoImg}
    alt="ChatGPT"
    className={`${className} object-contain`}
    style={white ? { filter: "brightness(0) invert(1)" } : undefined}
  />
);

const ClaudeLogo = ({ className = "w-8 h-8", white = false }: { className?: string; white?: boolean }) => (
  <img
    src={claudeLogoImg}
    alt="Claude"
    className={`${className} object-contain`}
    style={white ? { filter: "brightness(0) invert(1)" } : undefined}
  />
);

function McpLandingPage() {
  const [copied, setCopied] = useState(false);
  const [chatGptFlipped, setChatGptFlipped] = useState(false);
  const [claudeFlipped, setClaudeFlipped] = useState(false);
  const endpointUrl = "https://mcp.pikadecks.app/mcp";

  const handleCopy = () => {
    navigator.clipboard.writeText(endpointUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleScrollAndFlip = (type: "chatgpt" | "claude") => {
    const el = document.getElementById("supported-assistants");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => {
        if (type === "chatgpt") {
          setChatGptFlipped(true);
        } else {
          setClaudeFlipped(true);
        }
      }, 500);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground font-sans antialiased relative overflow-hidden">
      {/* Dynamic background accents mirroring Hero theme */}
      <div className="absolute inset-0 bg-radial-yellow pointer-events-none" aria-hidden />
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" aria-hidden />

      <Navbar />

      {/* Hero Section */}
      <section className="relative px-4 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="max-w-5xl mx-auto text-center flex flex-col items-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="font-display text-4xl md:text-7xl font-bold leading-[0.95] tracking-tight mb-6 max-w-4xl"
          >
            Connect <br className="hidden md:block" />
            <span className="relative inline-block">
              ChatGPT and Claude
              <span className="absolute -bottom-1.5 left-0 right-0 h-2 -z-10 bg-brand-yellow rounded-full" />
            </span> with <span className="text-brand-red">PikaDecks.</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="text-base md:text-lg text-muted-foreground max-w-2xl mb-10 text-balance"
          >
            Access your flashcards directly from your favorite AI assistants using the PikaDecks Model Context Protocol (MCP) Server.
          </motion.p>


          {/* Connection Diagram Illustration (Neobrutalist Shadow Pop styles) */}
          <div className="relative w-full max-w-2xl mx-auto py-12 flex justify-between items-center px-4">
            {/* ChatGPT Node */}
            <div className="w-20 h-20 bg-card border-2 border-foreground rounded-2xl flex flex-col items-center justify-center shadow-pop z-10 text-[#10a37f]">
              <ChatGptLogo className="w-14 h-14" />
            </div>

            {/* Left Connection line */}
            <div className="absolute top-1/2 -translate-y-1/2 left-20 right-1/2 h-1 bg-foreground/10 z-0">
              <div className="absolute w-2.5 h-2.5 bg-brand-yellow rounded-full top-[-3px] shadow-[0_0_8px_var(--brand-yellow)] animate-[move-right_3s_linear_infinite]" />
            </div>

            {/* Central PikaDecks Node */}
            <div className="w-28 h-28 bg-brand-yellow border-2 border-foreground rounded-[28px] flex items-center justify-center shadow-pop z-10 animate-float">
              <div className="w-full h-full bg-card rounded-[24px] border-2 border-foreground flex items-center justify-center p-1.5">
                <img src={pikadecksLogoImg} alt="PikaDecks" className="w-22 h-22 object-contain" />
              </div>
            </div>

            {/* Right Connection line */}
            <div className="absolute top-1/2 -translate-y-1/2 right-20 left-1/2 h-1 bg-foreground/10 z-0">
              <div className="absolute w-2.5 h-2.5 bg-brand-red rounded-full top-[-3px] shadow-[0_0_8px_var(--brand-red)] animate-[move-left_3s_linear_infinite]" />
            </div>

            {/* Claude Node */}
            <div className="w-20 h-20 bg-card border-2 border-foreground rounded-2xl flex flex-col items-center justify-center shadow-pop z-10 text-[#d97706]">
              <ClaudeLogo className="w-14 h-14" />
            </div>
          </div>
        </div>
      </section>

      {/* Supported AI Assistants Section */}
      <section id="supported-assistants" className="py-20 bg-card border-t-2 border-b-2 border-foreground/10">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-display text-3xl md:text-5xl font-bold text-center tracking-tight mb-4">Supported AI Assistants</h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-16 text-sm md:text-base">
            Supercharge your studies by integrating your flashcard decks with state of the art LLM assistants.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* ChatGPT Card Wrapper */}
            <div className="group relative h-[480px] w-full [perspective:1000px]">
              <div
                className={`relative h-full w-full rounded-2xl border-2 border-foreground transition-transform duration-500 [transform-style:preserve-3d] shadow-soft hover:shadow-pop ${
                  chatGptFlipped ? "[transform:rotateY(180deg)]" : ""
                }`}
              >
                {/* Front Face */}
                <div className="absolute inset-0 flex flex-col justify-between p-8 bg-background rounded-2xl [backface-visibility:hidden]">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 text-2xl font-bold mb-6 font-display">
                      <div className="w-11 h-11 rounded-xl bg-card border-2 border-foreground flex items-center justify-center text-[#10a37f] p-2.5">
                        <ChatGptLogo className="w-full h-full" />
                      </div>
                      ChatGPT
                    </div>
                    <ul className="space-y-4 mb-8">
                      {["Connect securely", "Create decks", "Save flashcards", "Review cards"].map((item, idx) => (
                        <li key={idx} className="flex items-center gap-3 text-foreground font-semibold text-sm">
                          <Check className="text-brand-red w-5 h-5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    className="w-full btn-pop bg-[#10a37f] hover:bg-[#0c8e6e] text-white font-bold rounded-xl py-4 h-auto flex items-center justify-center gap-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      setChatGptFlipped(true);
                    }}
                  >
                    <ChatGptLogo className="w-6 h-6" white />
                    Connect ChatGPT
                  </Button>
                </div>

                {/* Back Face (Guidance) */}
                <div className="absolute inset-0 flex flex-col justify-between p-8 bg-background rounded-2xl [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-y-auto">
                  <div className="flex-1">
                    <h3 className="font-display text-xl font-bold mb-4 flex items-center gap-2 text-[#10a37f]">
                      <ChatGptLogo className="w-6 h-6" /> Manual Setup (ChatGPT)
                    </h3>
                    <ol className="space-y-3 text-sm text-foreground/80 list-decimal list-inside font-medium mb-6">
                      <li>Go to ChatGPT plugins page, ensure <strong>Developer Mode</strong> is enabled, then create a new app.</li>
                      <li>Add the MCP link:<br />
                        <span className="font-mono text-xs text-brand-red bg-muted px-1.5 py-0.5 rounded break-all select-all">
                          https://mcp.pikadecks.app/mcp
                        </span>
                      </li>
                      <li>Set Authentication to <strong>OAuth</strong>:
                        <ul className="list-disc list-inside pl-4 mt-1 font-mono text-xs space-y-0.5">
                          <li>Client ID: <span className="text-brand-red select-all font-bold">chatgpt</span></li>
                        </ul>
                      </li>
                    </ol>
                  </div>
                  <Button
                    className="w-full btn-pop bg-muted hover:bg-muted/80 text-foreground font-bold rounded-xl py-4 h-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      setChatGptFlipped(false);
                    }}
                  >
                    Back to Overview
                  </Button>
                </div>
              </div>
            </div>

            {/* Claude Card Wrapper */}
            <div className="group relative h-[480px] w-full [perspective:1000px]">
              <div
                className={`relative h-full w-full rounded-2xl border-2 border-foreground transition-transform duration-500 [transform-style:preserve-3d] shadow-soft hover:shadow-pop ${
                  claudeFlipped ? "[transform:rotateY(180deg)]" : ""
                }`}
              >
                {/* Front Face */}
                <div className="absolute inset-0 flex flex-col justify-between p-8 bg-background rounded-2xl [backface-visibility:hidden]">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 text-2xl font-bold mb-6 font-display">
                      <div className="w-11 h-11 rounded-xl bg-card border-2 border-foreground flex items-center justify-center text-[#d97706] p-2.5">
                        <ClaudeLogo className="w-full h-full" />
                      </div>
                      Claude
                    </div>
                    <ul className="space-y-4 mb-8">
                      {["Connect securely", "Create decks", "Save flashcards", "Review cards"].map((item, idx) => (
                        <li key={idx} className="flex items-center gap-3 text-foreground font-semibold text-sm">
                          <Check className="text-brand-red w-5 h-5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    className="w-full btn-pop bg-[#d97706] hover:bg-[#c26a05] text-white font-bold rounded-xl py-4 h-auto flex items-center justify-center gap-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      setClaudeFlipped(true);
                    }}
                  >
                    <ClaudeLogo className="w-6 h-6" white />
                    Connect Claude
                  </Button>
                </div>

                {/* Back Face (Guidance) */}
                <div className="absolute inset-0 flex flex-col justify-between p-8 bg-background rounded-2xl [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-y-auto">
                  <div className="flex-1">
                    <h3 className="font-display text-xl font-bold mb-4 flex items-center gap-2 text-[#d97706]">
                      <ClaudeLogo className="w-6 h-6" /> Manual Setup (Claude)
                    </h3>
                    <ol className="space-y-3 text-sm text-foreground/80 list-decimal list-inside font-medium mb-6">
                      <li>Go to Claude page, ensure <strong>Developer Mode</strong> is enabled, then connect a new tool.</li>
                      <li>Add the MCP link:<br />
                        <span className="font-mono text-xs text-brand-red bg-muted px-1.5 py-0.5 rounded break-all select-all">
                          https://mcp.pikadecks.app/mcp
                        </span>
                      </li>
                      <li>Set Authentication to <strong>OAuth</strong>:
                        <ul className="list-disc list-inside pl-4 mt-1 font-mono text-xs space-y-0.5">
                          <li>Client ID: <span className="text-brand-red select-all font-bold">claude</span></li>
                        </ul>
                      </li>
                    </ol>
                  </div>
                  <Button
                    className="w-full btn-pop bg-muted hover:bg-muted/80 text-foreground font-bold rounded-xl py-4 h-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      setClaudeFlipped(false);
                    }}
                  >
                    Back to Overview
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-24 bg-background relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-display text-4xl md:text-6xl font-bold text-center tracking-tight mb-4">
            How It Works
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-16 text-sm md:text-base">
            Setting up takes less than a minute. Bridge your library directly with your AI workspace.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
            {[
              { num: "01", title: "Add PikaDecks MCP", desc: "Register the server endpoint within ChatGPT Custom GPT settings or your Claude configuration file." },
              { num: "02", title: "Sign in with PikaDecks", desc: "Authenticate securely using our standard OAuth login flow to connect your PikaDecks account." },
              { num: "03", title: "Use flashcard tools", desc: "Start prompting! Your assistant will read, write, and manage your flashcard decks effortlessly." }
            ].map((step, idx) => (
              <div key={step.num} className="group relative bg-card border-2 border-foreground rounded-2xl p-8 shadow-soft hover:shadow-pop transition-all duration-300">
                <div className="absolute -top-6 left-6 w-12 h-12 bg-brand-yellow border-2 border-foreground rounded-xl flex items-center justify-center font-display font-black text-lg shadow-[2px_2px_0px_#000]">
                  {step.num}
                </div>
                <div className="pt-4">
                  <h3 className="font-display text-xl font-extrabold mb-3 text-foreground group-hover:text-brand-red transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MCP Endpoint Section */}
      <section className="py-24 bg-card border-t-2 border-b-2 border-foreground/10 text-center relative">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-4">
            MCP Endpoint
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-10 text-sm md:text-base">
            Use the URL below to configure the Model Context Protocol connection in your AI client.
          </p>
          
          {/* Terminal styled URL container */}
          <div className="w-full max-w-2xl mx-auto bg-[#1e1e1e] border-2 border-foreground rounded-2xl shadow-pop overflow-hidden text-left mb-8">
            <div className="flex items-center justify-between px-4 py-3 bg-[#2d2d2d] border-b-2 border-foreground">
              <div className="flex gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-[#ef4444] border border-foreground/20" />
                <div className="w-3.5 h-3.5 rounded-full bg-[#eab308] border border-foreground/20" />
                <div className="w-3.5 h-3.5 rounded-full bg-[#22c55e] border border-foreground/20" />
              </div>
              <div className="text-xs font-mono text-zinc-400 font-bold select-none">
                mcp_endpoint_config
              </div>
              <div className="w-10" />
            </div>
            <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <span className="font-mono text-base md:text-lg font-bold text-emerald-400 break-all select-all">
                {endpointUrl}
              </span>
              <Button
                className="btn-pop bg-brand-yellow hover:bg-[#f1af7b] border-2 border-foreground text-brand-ink font-bold px-6 py-3.5 rounded-xl h-auto gap-2.5 w-full md:w-auto shrink-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-brand-red animate-bounce" /> Copied!
                  </>
                ) : (
                  <>
                    <Clipboard className="w-4 h-4" /> Copy Link
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Available Tools Section */}
      <section className="py-24 bg-background">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-display text-4xl md:text-6xl font-bold text-center tracking-tight mb-4">
            Available Tools
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-16 text-sm md:text-base">
            Standard operations supported by the PikaDecks MCP Server.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: "⚡", title: "Create Deck", desc: "Creates a brand new empty flashcard deck in your library.", code: "create_deck(title='...')" },
              { icon: "📥", title: "Save Flashcards", desc: "Appends a bulk batch of generated flashcards directly to an existing deck.", code: "save_flashcards(deck_id, cards)" },
              { icon: "📂", title: "List Decks", desc: "Retrieves a listing of the user's latest decks from the backend.", code: "list_decks()" },
              { icon: "🔖", title: "Get Deck", desc: "Loads detail and meta information for a specific deck in your account.", code: "get_deck(deck_id='...')" }
            ].map((tool, idx) => (
              <div key={idx} className="border-2 border-foreground rounded-2xl p-6 bg-card shadow-soft hover:shadow-pop transition-all duration-300 flex flex-col justify-between group">
                <div>
                  <div className="w-12 h-12 bg-brand-yellow/15 border-2 border-foreground rounded-xl flex items-center justify-center mb-5 font-black text-xl shadow-[2px_2px_0px_#000]">
                    {tool.icon}
                  </div>
                  <h3 className="font-display text-xl font-bold mb-2 group-hover:text-brand-red transition-colors">
                    {tool.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                    {tool.desc}
                  </p>
                </div>
                <div className="bg-[#faf6ee] border-2 border-foreground rounded-xl p-3.5 font-mono text-[11.5px] leading-tight text-foreground shadow-[2px_2px_0px_#000]">
                  <span className="text-brand-red font-bold">{tool.code.split('(')[0]}</span>
                  <span className="text-brand-ink/80">({tool.code.split('(')[1]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example Commands Section */}
      <section className="py-24 bg-card border-t-2 border-b-2 border-foreground/10">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display text-4xl md:text-6xl font-bold text-center tracking-tight mb-4">
            Example Commands
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-16 text-sm md:text-base">
            How to interact naturally with the server in plain English.
          </p>

          <div className="flex flex-col gap-8 max-w-2xl mx-auto bg-background border-2 border-foreground rounded-3xl p-6 md:p-8 shadow-pop relative">
            <div className="absolute top-4 left-6 flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-foreground/20" />
              <div className="w-2.5 h-2.5 rounded-full bg-foreground/20" />
              <div className="w-2.5 h-2.5 rounded-full bg-foreground/20" />
            </div>
            
            <div className="flex flex-col gap-6 mt-4">
              {/* Command 1 */}
              <div className="flex flex-col gap-2 items-end w-full">
                <div className="bg-brand-yellow border-2 border-foreground text-brand-ink font-bold text-sm max-w-[85%] rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-[3px_3px_0px_#000]">
                  "Create a deck called DSA Interview Prep"
                </div>
              </div>
              <div className="flex flex-col gap-2 items-start w-full">
                <div className="bg-card border-2 border-foreground text-foreground text-sm max-w-[85%] rounded-2xl rounded-tl-sm px-5 py-3.5 shadow-[3px_3px_0px_#000] font-medium leading-relaxed">
                  ✨ I've created the deck <strong>DSA Interview Prep</strong>. You can now generate and save flashcards into it!
                </div>
              </div>

              {/* Command 2 */}
              <div className="flex flex-col gap-2 items-end w-full">
                <div className="bg-brand-yellow border-2 border-foreground text-brand-ink font-bold text-sm max-w-[85%] rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-[3px_3px_0px_#000]">
                  "Save these flashcards to my Operating Systems deck"
                </div>
              </div>
              <div className="flex flex-col gap-2 items-start w-full">
                <div className="bg-card border-2 border-foreground text-foreground text-sm max-w-[85%] rounded-2xl rounded-bl-sm px-5 py-3.5 shadow-[3px_3px_0px_#000] font-medium leading-relaxed">
                  💾 Successfully saved 12 flashcards to your <strong>Operating Systems</strong> deck. Your Spaced Repetition reviews are scheduled.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-24 bg-background">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-display text-4xl md:text-6xl font-bold text-center tracking-tight mb-4">
            Enterprise-Grade Security
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-16 text-sm md:text-base">
            Protecting your data and configurations at every layer.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: <Shield className="w-8 h-8 text-brand-red" />, title: "OAuth Authentication", desc: "OAuth 2.0 flow ensures AI assistants only gain access to your cards with your explicit permission." },
              { icon: <Lock className="w-8 h-8 text-brand-red" />, title: "Secure Token Exchange", desc: "Strict token verification prevents eavesdropping and replay attacks." },
              { icon: <Database className="w-8 h-8 text-brand-red" />, title: "User-Owned Data", desc: "Your library is your own. We never train public models on your generated decks or questions." }
            ].map((item, idx) => (
              <div key={idx} className="group border-2 border-foreground rounded-2xl p-8 bg-card shadow-soft hover:shadow-pop transition-all duration-300 text-center">
                <div className="w-14 h-14 bg-brand-yellow/15 border-2 border-foreground rounded-full flex items-center justify-center mx-auto mb-6 shadow-[2px_2px_0px_#000] group-hover:scale-110 transition-transform duration-300">
                  {item.icon}
                </div>
                <h3 className="font-display text-xl font-bold mb-3 text-foreground">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

    
      <Footer />
    </main>
  );
}
