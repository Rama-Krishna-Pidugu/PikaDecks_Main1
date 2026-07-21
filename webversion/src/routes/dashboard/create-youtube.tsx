import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Sliders, Sparkles, Youtube } from "lucide-react";
import { apiFetch } from "@/lib/api";

import { useUploadUsage } from "@/lib/queries";
import { useProcessingManager } from "@/context/processing-context";

export const Route = createFileRoute("/dashboard/create-youtube")({
  component: CreateYoutubePage,
});

function CreateYoutubePage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const pollTimer = useRef<number | null>(null);
  const prevJobRef = useRef<string | null>(null);
  const [url, setUrl] = useState("");
  const [cardLimit, setCardLimit] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const usageQuery = useUploadUsage();
  const usage = usageQuery.data;

  const ready = isYoutubeUrl(url);

  const { activeJobs, isLoading, cancelJob } = useProcessingManager();
  const runningYoutubeJob = activeJobs.find(
    job => job.type === "youtube" && (job.status === "pending" || job.status === "processing" || job.status === "queued")
  );

  useEffect(() => {
    if (runningYoutubeJob) {
      setGenerating(true);
      setProgress(runningYoutubeJob.progress);
      setStatusText(youtubeStageMessage(runningYoutubeJob.stage, runningYoutubeJob.status));
      prevJobRef.current = runningYoutubeJob.id;
      setCurrentJobId(runningYoutubeJob.id);
    } else if (prevJobRef.current) {
      const checkFinalStatus = async () => {
        const jobId = prevJobRef.current;
        prevJobRef.current = null;
        setCurrentJobId(null);
        try {
          const data = await apiFetch<{
            deck_id?: string | null;
            status?: string;
          }>(`/youtube/generation/${jobId}`, { getToken });
          if (data.status === "completed" && data.deck_id) {
            router.navigate({ to: "/dashboard/deck/$deckId", params: { deckId: data.deck_id } });
          }
        } catch (e) {
          console.error("Error checking final job status:", e);
        }
      };
      void checkFinalStatus();
      setGenerating(false);
    }
  }, [runningYoutubeJob, getToken, router]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, []);

  const pollGeneration = async (generationId: string) => {
    const data = await apiFetch<{
      deck_id?: string | null;
      error?: { message?: string } | null;
      progress?: number;
      stage?: string | null;
      status?: string;
    }>(`/youtube/generation/${generationId}`, { getToken });

    setProgress(data.progress ?? 0);
    setStatusText(youtubeStageMessage(data.stage, data.status));

    if (data.status === "completed" && data.deck_id) {
      router.navigate({ to: "/dashboard/deck/$deckId", params: { deckId: data.deck_id } });
      return;
    }

    if (data.status === "failed") {
      throw new Error(data.error?.message || "YouTube generation failed. Please try another video.");
    }

    pollTimer.current = window.setTimeout(() => void pollGeneration(generationId).catch(handlePollingError), 3000);
  };

  const handlePollingError = (e: unknown) => {
    setError(e instanceof Error ? e.message : "Could not finish YouTube generation.");
    setStatusText("");
    setGenerating(false);
    setCurrentJobId(null);
  };

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    if (usage && !usage.unlimited && (usage.remaining ?? 0) <= 0) {
      setError("You have used all free AI generations for this 24-hour window. Upgrade to Pro or try again after the reset.");
      return;
    }

    setGenerating(true);
    setError(null);
    setProgress(5);
    setStatusText("Starting YouTube generation...");

    try {
      const data = await apiFetch<{ generation_id?: string }>("/youtube/generate", {
        method: "POST",
        getToken,
        bodyJson: {
          url: url.trim(),
          num_cards: cardLimit,
          languages: ["en"],
        },
      });

      if (!data.generation_id) throw new Error("YouTube generation started, but no job was returned.");
      setCurrentJobId(data.generation_id);
      await pollGeneration(data.generation_id);
    } catch (e: any) {
      setError(e?.message || "Could not start YouTube generation.");
      setStatusText("");
      setGenerating(false);
      setCurrentJobId(null);
    }
  };

  if (isLoading && !generating) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 px-4 py-6 md:py-8 font-sans pb-20">
        <nav>
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:underline">
            Back to Dashboard
          </Link>
        </nav>
        <section className="border-b border-border pb-4">
          <h1 className="font-display text-3xl font-extrabold text-foreground tracking-tight">Create From YouTube</h1>
        </section>
        <div className="border border-border bg-card rounded-[2rem] p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[320px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Syncing queue status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-4 py-6 md:py-8 font-sans pb-20">
      <nav>
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:underline">
          Back to Dashboard
        </Link>
      </nav>

      <section className="border-b border-border pb-4">
        <h1 className="font-display text-3xl font-extrabold text-foreground tracking-tight">Create From YouTube</h1>
        <p className="text-sm font-semibold text-muted-foreground mt-1.5 leading-relaxed">
          Paste an educational video link and PikaDecks will turn the transcript into active-recall flashcards.
        </p>
        {usage ? (
          <p className="mt-2 text-xs font-bold text-primary">
            {usage.unlimited ? "Unlimited AI generations available" : `${usage.remaining ?? 0}/${usage.limit ?? 10} AI generations remaining`}
          </p>
        ) : null}
      </section>

      {generating ? (
        <div className="border border-border bg-card rounded-[2rem] p-10 flex flex-col items-center justify-center text-center gap-6 min-h-[320px]">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-500 animate-bounce">
            <Youtube className="h-8 w-8 stroke-[2.5]" />
          </div>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="w-full space-y-1">
            <h3 className="font-display text-lg font-extrabold text-foreground">Video Generator Active</h3>
            <p className="text-xs font-bold text-primary max-w-sm mx-auto leading-relaxed animate-pulse">{statusText}</p>
            <div className="mx-auto mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(progress, 8)}%` }} />
            </div>
          </div>
          {currentJobId && (
            <button
              type="button"
              onClick={async () => {
                if (window.confirm("Are you sure you want to cancel this YouTube generation?")) {
                  try {
                    await cancelJob(currentJobId, "youtube");
                    setGenerating(false);
                    setCurrentJobId(null);
                    setStatusText("");
                    setProgress(0);
                  } catch (err) {
                    console.error("Cancel failed:", err);
                  }
                }
              }}
              className="mt-4 px-6 py-2.5 border border-rose-200 text-rose-600 hover:bg-rose-50 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
            >
              Cancel Generation
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleGenerate} className="space-y-6">
          {error ? (
            <div className="border border-rose-200 rounded-2xl bg-rose-50/50 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
              <p className="text-xs font-bold text-rose-600 leading-relaxed">{error}</p>
            </div>
          ) : null}

          <div className="border border-border bg-card rounded-[2rem] p-6 md:p-8 space-y-3">
            <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest pl-1 block">YouTube URL</label>
            <input
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setError(null);
              }}
              className="w-full border border-border rounded-2xl px-4 py-3 bg-background font-semibold text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
            {url && !ready ? <p className="text-xs font-bold text-rose-600">Enter a valid YouTube or youtu.be link.</p> : null}
          </div>

          <div className="border border-border bg-card rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-extrabold text-primary uppercase tracking-widest pl-0.5">
                <Sliders className="h-4 w-4" />
                <span>Cards to generate</span>
              </div>
              <span className="bg-indigo-50 text-primary font-extrabold text-xs px-3.5 py-1.5 rounded-xl border border-indigo-100">
                {cardLimit} cards
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              value={cardLimit}
              onChange={(event) => setCardLimit(parseInt(event.target.value))}
              className="w-full h-2 bg-background border border-border/80 rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          <button
            type="submit"
            disabled={!ready}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-extrabold text-sm py-4 rounded-2xl hover:scale-[0.98] transition-transform disabled:opacity-50 disabled:scale-100 cursor-pointer"
          >
            <Sparkles className="h-5 w-5 stroke-[2.5]" />
            <span>GENERATE FROM YOUTUBE</span>
          </button>
        </form>
      )}
    </div>
  );
}

function isYoutubeUrl(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  return text.includes("youtube.com/watch") || text.includes("youtu.be/") || text.includes("youtube.com/shorts/");
}

function youtubeStageMessage(stage?: string | null, status?: string) {
  if (status === "queued" || stage === "QUEUED") return "Waiting for the video worker...";
  if (stage === "EXTRACTING_TRANSCRIPT") return "Extracting the transcript...";
  if (stage === "SUMMARIZING") return "Finding the most useful study points...";
  if (stage === "GENERATING_CARDS") return "Generating flashcards...";
  if (stage === "CREATING_DECK") return "Saving your deck...";
  if (status === "completed") return "Deck ready.";
  return "Processing the video...";
}
