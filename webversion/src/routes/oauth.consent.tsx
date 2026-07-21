import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Check, Lock, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/oauth/consent")({
  component: ConsentPage,
});

import chatGptLogo from "../assets/Pika/icons8-chatgpt-100.png";
import claudeLogo from "../assets/Pika/icons8-claude-ai-96.png";
import pikaHello from "../assets/Pika/hello.png";
import pikaStudy from "../assets/Pika/studytime.PNG";

const ClaudeLogo = () => (
  <img src={claudeLogo} alt="Claude" className="h-6 w-6 object-contain" />
);

const ChatGPTLogo = () => (
  <img src={chatGptLogo} alt="ChatGPT" className="h-6 w-6 object-contain" />
);

function ConsentPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const searchParams = Route.useSearch() as Record<string, string>;

  const client_id = searchParams.client_id || "";
  const redirect_uri = searchParams.redirect_uri || "";
  const state = searchParams.state || "";
  const scope = searchParams.scope || "";

  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not signed in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const currentUrl = window.location.pathname + window.location.search;
      void router.navigate({
        to: "/login",
        search: { redirect_url: currentUrl },
      });
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#fcf8f5] text-foreground font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-sm font-bold text-muted-foreground tracking-wider uppercase">Loading consent session...</p>
      </div>
    );
  }

  const handleApprove = async () => {
    setAuthorizing(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Could not retrieve Clerk session token.");
      }

      const { API_BASE_URL } = await import("../lib/api");
      
      const response = await fetch(`${API_BASE_URL}/oauth/consent/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id,
          redirect_uri,
          state,
          scope,
          clerk_token: token,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to approve authorization request.");
      }

      const data = await response.json();
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        throw new Error("Invalid response from authorization server.");
      }
    } catch (err: any) {
      console.error("Authorization approval error:", err);
      setError(err?.message || "An unexpected error occurred during authorization.");
      setAuthorizing(false);
    }
  };

  const handleCancel = () => {
    setError("Authorization cancelled by the user.");
  };

  const isClaude = client_id.includes("claude");
  const isChatGPT = client_id.includes("chatgpt");
  const clientName = isClaude ? "Claude" : isChatGPT ? "ChatGPT" : "AI Assistant";
  const vendorName = isClaude ? "Anthropic" : isChatGPT ? "OpenAI" : "This application";

  let theme = {
    pageBg: "bg-[#fcf8f5]",
    cardBg: "bg-white",
    permBoxBg: "bg-[#fdf9f4] border-[#f0e6da]",
    buttonBg: "bg-[#f4b679] hover:bg-[#e6a263]",
  };

  if (isClaude) {
    theme = {
      pageBg: "bg-[#fcf8f5]",
      cardBg: "bg-gradient-to-b from-[#faeee3] to-white border-[#f0e3d5]",
      permBoxBg: "bg-[#faf6f1] border-[#efe8df]",
      buttonBg: "bg-[#f4b679] hover:bg-[#e6a263]",
    };
  } else if (isChatGPT) {
    theme = {
      pageBg: "bg-[#f8fbf9]",
      cardBg: "bg-gradient-to-b from-[#e3f4ec] to-white border-[#d5eadf]",
      permBoxBg: "bg-[#f7fbf8] border-[#eaf0ed]",
      buttonBg: "bg-[#f4b679] hover:bg-[#e6a263]",
    };
  }

  return (
    <div className={`flex min-h-screen ${theme.pageBg} font-sans relative overflow-hidden items-center justify-center p-4 md:p-8`}>
      <div className={`relative z-10 w-full max-w-[420px] md:max-w-[880px] flex flex-col md:flex-row rounded-[2rem] md:rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black/5 border ${theme.cardBg}`}>
        
        {/* Desktop Left Side Branding */}
        <div className="hidden md:flex w-1/2 flex-col justify-between p-10 lg:p-12 bg-white/40 backdrop-blur-sm border-r border-white/50 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-yellow-300 to-yellow-500 shadow-sm border border-yellow-200">
                <img src="/appIcon.png" alt="Pikadecks" className="h-6 w-6 object-contain drop-shadow-md" onError={(e) => e.currentTarget.src = "/favicon.png"} />
              </div>
              <span className="font-display font-extrabold text-2xl text-[#4a392b] tracking-tight">Pikadecks</span>
            </div>
            
            <h2 className="font-display text-[32px] lg:text-[38px] font-extrabold text-[#4a392b] leading-[1.15] mb-5 tracking-tight">
              Supercharge your study workflow.
            </h2>
            <p className="text-[16px] font-medium text-[#7a6a5d] leading-relaxed pr-4">
              Connect your favorite AI assistant to seamlessly create decks, generate smart flashcards, and process your study materials automatically.
            </p>
          </div>
          
          <div className="relative z-10 flex items-center justify-center mt-12 mb-4">
            <img src={isClaude ? pikaHello : pikaStudy} alt="Mascot" className="h-56 object-contain drop-shadow-xl" />
          </div>

          {/* Decorative background blobs */}
          <div className="absolute top-[-20%] left-[-20%] w-64 h-64 rounded-full bg-white/60 blur-3xl" />
          <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 rounded-full bg-white/60 blur-3xl" />
        </div>

        {/* Right Side - Auth Form */}
        <div className="w-full md:w-1/2 p-8 md:p-10 lg:p-12 bg-white/90 backdrop-blur-md flex flex-col justify-center">
        
        {/* Logos Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-yellow-300 to-yellow-500 shadow-sm border border-yellow-200">
              <img src="/appIcon.png" alt="Pikadecks" className="h-10 w-10 object-contain drop-shadow-md" onError={(e) => e.currentTarget.src = "/favicon.png"} />
            </div>
            
            <div className="flex items-center gap-1.5 opacity-30">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
              <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
              <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
            </div>

            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm border border-slate-100">
              {isClaude ? <ClaudeLogo /> : isChatGPT ? <ChatGPTLogo /> : <ShieldCheck className="h-8 w-8 text-slate-700" />}
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-white px-3 py-1 mb-5 shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest">
              SECURE AUTHORIZATION
            </span>
          </div>

          <h1 className="font-display text-[26px] font-extrabold text-[#4a392b] leading-tight tracking-tight mb-2 text-center">
            Connect {clientName} to Pikadecks
          </h1>
          <p className="text-[15px] font-medium text-[#7a6a5d] text-center">
            Allow {vendorName} to act inside your Pikadecks study workspace.
          </p>
        </div>

        {/* Scopes Box */}
        <div className={`rounded-3xl border p-6 mb-6 space-y-4 ${theme.permBoxBg}`}>
          <p className="text-[11px] font-extrabold text-[#9a8c80] uppercase tracking-wider mb-2">
            {clientName.toUpperCase()} WILL BE ABLE TO
          </p>
          <div className="flex gap-3.5 items-start text-[14px] font-bold text-[#4a392b] leading-snug">
            <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
            </div>
            <span>Create new decks inside your study collection</span>
          </div>
          <div className="flex gap-3.5 items-start text-[14px] font-bold text-[#4a392b] leading-snug">
            <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
            </div>
            <span>Generate and save cards from prompts or notes</span>
          </div>
          <div className="flex gap-3.5 items-start text-[14px] font-bold text-[#4a392b] leading-snug">
            <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
            </div>
            <span>Queue document uploads and PDF notes for processing</span>
          </div>
        </div>

        {/* Security Alert Note */}
        <div className="flex items-start gap-2.5 mb-8 px-1">
          <Lock className="h-4 w-4 text-[#8a7b6c] shrink-0 mt-0.5" />
          <p className="text-[13px] font-medium text-[#8a7b6c] leading-relaxed">
            Existing private decks, study logs, and analytics stay private and out of reach for this integration.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex gap-3 items-start border border-rose-200 bg-rose-50/50 rounded-2xl p-4 text-xs font-bold text-rose-600">
            <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3.5">
          <button
            onClick={handleApprove}
            disabled={authorizing}
            className={`w-full inline-flex items-center justify-center rounded-[1.25rem] px-5 py-4 text-[15px] font-extrabold text-[#5c3716] transition-transform hover:scale-[0.99] shadow-sm disabled:opacity-50 disabled:hover:scale-100 ${theme.buttonBg}`}
          >
            {authorizing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#5c3716]" />
                Authorizing...
              </>
            ) : (
              "Authorize access"
            )}
          </button>
          
          <button
            onClick={handleCancel}
            disabled={authorizing}
            className="w-full inline-flex items-center justify-center rounded-[1.25rem] border-2 border-[#eeebe6] bg-white px-5 py-3.5 text-[15px] font-extrabold text-[#5c3716] shadow-sm transition-transform hover:scale-[0.99] hover:bg-slate-50 disabled:opacity-50 disabled:hover:scale-100"
          >
            Cancel
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
