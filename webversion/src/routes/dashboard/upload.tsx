import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useRef, useState } from "react";
import { FileText, Sliders, Play, Loader2, Sparkles, UploadCloud, AlertCircle } from "lucide-react";
import { API_BASE_URL, apiFetch, getClerkToken } from "@/lib/api";

import { useUploadUsage } from "@/lib/queries";
import { useProcessingManager } from "@/context/processing-context";

export const Route = createFileRoute("/dashboard/upload")({
  component: PDFUploadPage,
});

function PDFUploadPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const pollTimer = useRef<number | null>(null);
  const prevJobRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [cardLimit, setCardLimit] = useState(10);
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const usageQuery = useUploadUsage();
  const usage = usageQuery.data;

  const { activeJobs } = useProcessingManager();
  const runningPDFJob = activeJobs.find(
    job => job.type === "pdf" && (job.status === "pending" || job.status === "processing" || job.status === "queued")
  );

  useEffect(() => {
    if (runningPDFJob) {
      setUploading(true);
      setProgress(runningPDFJob.progress);
      setStatusText(stageMessage(runningPDFJob.stage, runningPDFJob.status));
      prevJobRef.current = runningPDFJob.id;
    } else if (prevJobRef.current) {
      const checkFinalStatus = async () => {
        const jobId = prevJobRef.current;
        prevJobRef.current = null;
        try {
          const data = await apiFetch<{
            deck_id?: string | null;
            processing_status?: string;
          }>(`/uploads/${jobId}/status`, { getToken });
          if (data.processing_status === "completed" && data.deck_id) {
            router.navigate({ to: "/dashboard/deck/$deckId", params: { deckId: data.deck_id } });
          }
        } catch (e) {
          console.error("Error checking final job status:", e);
        }
      };
      void checkFinalStatus();
      setUploading(false);
    }
  }, [runningPDFJob, getToken, router]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, []);

  const pollUploadStatus = (uploadId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const runPoll = async () => {
        try {
          const data = await apiFetch<{
            deck_id?: string | null;
            error_code?: string | null;
            error_message?: string | null;
            processing_progress?: number;
            processing_stage?: string | null;
            processing_status?: string;
          }>(`/uploads/${uploadId}/status`, { getToken });

          setProgress(data.processing_progress ?? 0);
          setStatusText(stageMessage(data.processing_stage, data.processing_status));

          if (data.processing_status === "completed" && data.deck_id) {
            setStatusText("");
            router.navigate({ to: "/dashboard/deck/$deckId", params: { deckId: data.deck_id } });
            resolve();
            return;
          }

          if (data.processing_status === "failed" || data.processing_status === "aborted") {
            reject(new Error(data.error_message || "PDF generation failed. Please try again."));
            return;
          }

          pollTimer.current = window.setTimeout(() => {
            void runPoll();
          }, 2500);
        } catch (err) {
          reject(err);
        }
      };
      void runPoll();
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];
      if (selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf")) {
        setFile(selected);
      } else {
        setError("Invalid file type. Please select a secure PDF document.");
      }
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (usage && !usage.unlimited && (usage.remaining ?? 0) <= 0) {
      setError("You have used all free AI generations for this 24-hour window. Upgrade to Pro or try again after the reset.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      // Step 1: Secure upload authorization
      setStatusText("Authorizing secure PDF upload...");
      setProgress(5);
      const token = await getClerkToken(getToken);
      if (!token) throw new Error("Missing auth credentials.");

      const presignedRes = await fetch(
        `${API_BASE_URL}/uploads/presigned-url?file_name=${encodeURIComponent(file.name)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const presignedData = await presignedRes.json();
      if (!presignedRes.ok) throw new Error(presignedData?.detail || "Could not retrieve S3 slot.");

      // Step 2: Stream PDF to S3 destination
      setStatusText("Uploading document to secure storage...");
      setProgress(15);
      const xhrHeaders: Record<string, string> = {
        "Content-Type": "application/pdf",
        ...(presignedData.headers || {}),
      };

      const s3Res = await fetch(presignedData.upload_url, {
        method: "PUT",
        headers: xhrHeaders,
        body: file,
      });

      if (!s3Res.ok) throw new Error("Failed to upload file to storage.");

      // Step 3: AI Document Processing
      setStatusText("AI is extracting outlines and generating flashcards...");
      setProgress(25);
      const processData = await apiFetch<{ upload_id?: string; deck_id?: string }>("/uploads/process-async", {
        method: "POST",
        getToken,
        bodyJson: {
          file_url: presignedData.file_url,
          file_name: file.name,
          file_type: file.type || "application/pdf",
          num_cards: cardLimit,
        },
      });

      if (processData.deck_id) {
        router.navigate({ to: "/dashboard/deck/$deckId", params: { deckId: processData.deck_id } });
        return;
      }
      if (!processData.upload_id) throw new Error("Upload started, but no processing job was returned.");
      await pollUploadStatus(processData.upload_id);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      setStatusText("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 px-4 py-4 md:py-6 font-sans">
      {/* Back link */}
      <nav>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:underline transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </nav>

      {/* Page Header */}
      <section className="border-b border-border pb-3">
        <h1 className="font-display text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
          Upload PDF Outline
        </h1>
        <p className="text-sm font-semibold text-muted-foreground mt-1 leading-relaxed">
          Turn your slides, textbooks, syllabus, or lecture sheets into smart active-recall review cards!
        </p>
        {usage ? (
          <p className="mt-1.5 text-xs font-bold text-primary">
            {usage.unlimited ? "Unlimited AI generations available" : `${usage.remaining ?? 0}/${usage.limit ?? 10} AI generations remaining`}
          </p>
        ) : null}
      </section>

      {uploading ? (
        /* Progress loader */
        <div className="border border-border bg-card rounded-[2rem] p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[280px]">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/20 bg-brand-soft text-brand-foreground animate-bounce">
            <Sparkles className="h-6 w-6 stroke-[2.5]" />
          </div>
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <div className="space-y-1">
            <h3 className="font-display text-base font-extrabold text-foreground">AI Generator Active</h3>
            <p className="text-xs font-bold text-primary max-w-sm mx-auto leading-relaxed animate-pulse">
              {statusText}
            </p>
            <div className="mt-3 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(progress, 8)}%` }} />
            </div>
          </div>
        </div>
      ) : (
        /* Form view */
        <form onSubmit={handleGenerate} className="space-y-5">
          {error && (
            <div className="border border-rose-200 rounded-2xl bg-rose-50/50 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
              <p className="text-xs font-bold text-rose-600 leading-relaxed">{error}</p>
            </div>
          )}

          {/* Upload Drop Zone Card / Compact Card Redesign */}
          <div className="relative">
            {!file ? (
              <div className="relative">
                <input
                  type="file"
                  accept="application/pdf"
                  id="pdf-picker"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="border-2 border-dashed border-border bg-card rounded-[2rem] p-8 flex flex-col items-center justify-center text-center gap-4 transition-all hover:bg-muted/15">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground">Select study PDF</h3>
                    <p className="text-[10px] font-extrabold text-muted-foreground mt-1 uppercase tracking-wider">Drag & drop or tap to browse files</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 text-lg">
                    📄
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold text-foreground truncate max-w-[180px] sm:max-w-md animate-fade-in" title={file.name}>
                      {file.name}
                    </h3>
                    <p className="text-[10px] font-bold text-muted-foreground mt-0.5">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                </div>
                <div className="relative shrink-0">
                  <input
                    type="file"
                    accept="application/pdf"
                    id="pdf-picker"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <label
                    htmlFor="pdf-picker"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-4 text-xs font-extrabold text-foreground transition-all hover:bg-muted cursor-pointer"
                  >
                    Change File
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Generator Limit Slider Card */}
          <div className="border border-border bg-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-extrabold text-primary uppercase tracking-widest pl-0.5">
                <Sliders className="h-4 w-4" />
                <span>Cards to generate</span>
              </div>
              <span className="bg-indigo-50 text-primary font-extrabold text-xs px-3.5 py-1.5 rounded-xl border border-indigo-100">
                {cardLimit} cards
              </span>
            </div>

            <div className="space-y-2">
              <input
                type="range"
                min="5"
                max="30"
                value={cardLimit}
                onChange={(e) => setCardLimit(parseInt(e.target.value))}
                className="w-full h-2 bg-background border border-border/80 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[9px] font-extrabold text-muted-foreground tracking-widest uppercase px-0.5">
                <span>Min: 5</span>
                <span className="text-primary/75">Default: 10</span>
                <span>Max: 30</span>
              </div>
            </div>
          </div>

          {/* Form Action */}
          <button
            type="submit"
            disabled={!file}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-extrabold text-sm py-4 rounded-2xl hover:scale-[0.98] transition-transform disabled:opacity-50 disabled:scale-100 cursor-pointer"
          >
            <Sparkles className="h-5 w-5 stroke-[2.5]" />
            <span>GENERATE AI FLASHCARDS</span>
          </button>
        </form>
      )}
    </div>
  );
}

function stageMessage(stage?: string | null, status?: string) {
  if (status === "queued" || stage === "QUEUED") return "Waiting for the AI worker...";
  if (stage === "EXTRACTING_TEXT") return "Reading your PDF...";
  if (stage === "GENERATING_CARDS") return "Generating flashcards...";
  if (stage === "CREATING_DECK") return "Saving your deck...";
  if (stage === "COMPLETED" || status === "completed") return "Deck ready.";
  return "AI is processing your PDF...";
}
