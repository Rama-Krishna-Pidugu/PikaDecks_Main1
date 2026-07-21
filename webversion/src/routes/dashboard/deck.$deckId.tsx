import { createFileRoute, Link, useRouter, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ChevronLeft, Plus, Trash2, Edit2, Play, Eye, EyeOff, Loader2, AlertCircle, Upload, X } from "lucide-react";
import { getDeckTint, getDeckEmoji } from "@/lib/theme";
import { useAuth } from "@clerk/tanstack-react-start";
import { getClerkToken, API_BASE_URL } from "@/lib/api";
import { MathText } from "@/components/MathText";
import {
  useDeckDetail,
  useDeckCards,
  useCreateCard,
  useUpdateCard,
  useDeleteCard,
  useDeleteDeck,
  useUpdateDeck,
  type Card,
} from "@/lib/queries";

export const Route = createFileRoute("/dashboard/deck/$deckId")({
  component: DeckDetailPage,
});

function DeckDetailPage() {
  const { deckId } = useParams({ from: "/dashboard/deck/$deckId" });
  const router = useRouter();
  const { getToken } = useAuth();

  // TanStack Query hooks
  const deckQuery = useDeckDetail(deckId);
  const cardsQuery = useDeckCards(deckId);
  const createCardMutation = useCreateCard(deckId);
  const updateCardMutation = useUpdateCard(deckId);
  const deleteCardMutation = useDeleteCard(deckId);
  const deleteDeckMutation = useDeleteDeck();
  const updateDeckMutation = useUpdateDeck(deckId);

  const savingCard = createCardMutation.isPending || updateCardMutation.isPending;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");

  const deck = deckQuery.data;

  useEffect(() => {
    if (deck) {
      setEditedTitle(deck.title);
      setEditedDescription(deck.description || "");
    }
  }, [deck]);

  const handleSaveDeckDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedTitle.trim()) return;
    try {
      await updateDeckMutation.mutateAsync({
        title: editedTitle.trim(),
        description: editedDescription.trim() || "",
      });
      setIsEditingTitle(false);
    } catch (e: any) {
      alert(e?.message || "Could not update deck details.");
    }
  };
  const cards = cardsQuery.data || [];
  const loading = deckQuery.isLoading || cardsQuery.isLoading;
  const error = deckQuery.error?.message || cardsQuery.error?.message || null;

  // Card Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newExplanation, setNewExplanation] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [notesImageUrl, setNotesImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingNotesImage, setUploadingNotesImage] = useState(false);

  // Expanded card state
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const openCardModal = (card?: Card) => {
    if (card) {
      setEditingCardId(card.card_id);
      setNewQuestion(card.question);
      setNewAnswer(card.answer);
      setNewExplanation(card.explanation || "");
      setImageUrl(card.image_url || "");
      setNotesImageUrl(card.notes_image_url || "");
    } else {
      setEditingCardId(null);
      setNewQuestion("");
      setNewAnswer("");
      setNewExplanation("");
      setImageUrl("");
      setNotesImageUrl("");
    }
    setModalOpen(true);
  };

  const uploadImageFile = async (file: File, forNotes: boolean) => {
    if (forNotes) {
      setUploadingNotesImage(true);
    } else {
      setUploadingImage(true);
    }
    try {
      const token = await getClerkToken(getToken);
      if (!token) throw new Error("Missing auth credentials.");

      const mimeType = file.type || "image/png";

      const presignedRes = await fetch(
        `${API_BASE_URL}/uploads/image/presign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            file_name: file.name,
            content_type: mimeType,
          }),
        }
      );
      const presignedData = await presignedRes.json();
      if (!presignedRes.ok) throw new Error(presignedData?.detail || "Could not retrieve upload slot.");

      const xhrHeaders: Record<string, string> = {
        "Content-Type": mimeType,
        ...(presignedData.headers || {}),
      };

      const s3Res = await fetch(presignedData.upload_url, {
        method: "PUT",
        headers: xhrHeaders,
        body: file,
      });

      if (!s3Res.ok) throw new Error("Failed to upload file to storage.");

      if (forNotes) {
        setNotesImageUrl(presignedData.file_url);
      } else {
        setImageUrl(presignedData.file_url);
      }
    } catch (err: any) {
      alert(err.message || "Failed to upload image.");
    } finally {
      if (forNotes) {
        setUploadingNotesImage(false);
      } else {
        setUploadingImage(false);
      }
    }
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    try {
      const body = {
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
        explanation: newExplanation.trim() || null,
        image_url: imageUrl.trim() || null,
        notes_image_url: notesImageUrl.trim() || null,
      };

      if (editingCardId) {
        await updateCardMutation.mutateAsync({ cardId: editingCardId, ...body });
      } else {
        await createCardMutation.mutateAsync(body);
      }

      setModalOpen(false);
      setEditingCardId(null);
      setNewQuestion("");
      setNewAnswer("");
      setNewExplanation("");
    } catch (e: any) {
      alert(e?.message || "Could not save card.");
    }
  };

  const handleDeleteCard = async (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this card?")) return;
    try {
      await deleteCardMutation.mutateAsync(cardId);
    } catch (e: any) {
      alert(e?.message || "Could not delete card.");
    }
  };

  const handleDeleteDeck = async () => {
    if (!confirm("Are you sure you want to delete this entire deck? This cannot be undone.")) return;
    try {
      await deleteDeckMutation.mutateAsync(deckId);
      router.navigate({ to: "/dashboard/decks" });
    } catch (e: any) {
      alert(e?.message || "Could not delete deck.");
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !deck) {
    return (
      <div className="border border-border rounded-[2.5rem] bg-rose-50/50 p-8 text-center max-w-lg mx-auto mt-12">
        <span className="text-3xl block mb-2">⚠️</span>
        <h3 className="font-display text-lg font-extrabold text-foreground">Failed to load deck details</h3>
        <p className="text-xs font-semibold text-muted-foreground mt-2 mb-4">{error || "Deck not found"}</p>
        <Link
          to="/dashboard/decks"
          className="border border-border bg-card text-xs font-extrabold px-6 py-2.5 rounded-xl"
        >
          Back to Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24 font-sans px-2 sm:px-4">
      
      {/* 1. PEACH-YELLOW BRAND HEADER CARD */}
      <header className="bg-brand-soft/60 border border-brand/20 p-5 sm:p-6 md:p-8 rounded-[2.5rem] flex flex-col md:flex-row md:items-start justify-between gap-5 transition-all">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <Link
            to="/dashboard/decks"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-card hover:scale-[1.05] active:scale-[0.95] transition-all cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5 stroke-[2.5]" />
          </Link>
          <div className="min-w-0 flex-1 pr-0 md:pr-4">
            {isEditingTitle ? (
              <form onSubmit={handleSaveDeckDetails} className="space-y-3 w-full">
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="w-full text-sm font-bold text-foreground bg-background border border-border rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/45"
                  required
                  placeholder="Deck Title"
                />
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="w-full text-xs font-semibold text-muted-foreground bg-background border border-border rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/45"
                  placeholder="Deck Description (optional)"
                  rows={2}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingTitle(false);
                      setEditedTitle(deck?.title || "");
                      setEditedDescription(deck?.description || "");
                    }}
                    className="border border-border bg-card hover:bg-muted text-foreground text-xs font-extrabold px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={updateDeckMutation.isPending}
                    className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-extrabold px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                  >
                    {updateDeckMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    SAVE
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2 group flex-wrap">
                  <h1 className="line-clamp-2 break-words font-display text-lg sm:text-xl md:text-2xl font-extrabold text-foreground leading-tight">
                    {deck?.title}
                  </h1>
                  <button
                    onClick={() => setIsEditingTitle(true)}
                    className="text-muted-foreground hover:text-foreground opacity-100 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all p-1 cursor-pointer"
                    title="Edit Deck Details"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
                {deck?.description && (
                  <p className="text-xs text-muted-foreground font-semibold mt-1">
                    {deck.description}
                  </p>
                )}
                <p className="text-xs font-extrabold text-muted-foreground mt-1.5 flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary/40 animate-pulse" />
                  {cards.length} card{cards.length === 1 ? "" : "s"} total
                </p>
              </>
            )}
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex w-full shrink-0 flex-wrap gap-2.5 self-start md:w-auto md:max-w-[320px] md:justify-end">
          <button
            onClick={() => openCardModal()}
            className="flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl bg-brand px-4 text-xs font-extrabold text-brand-foreground hover:scale-[0.98] transition-transform cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>ADD CARD</span>
          </button>

          <button
            onClick={handleDeleteDeck}
            className="flex h-10 w-[132px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-rose-200 bg-rose-50 px-3 text-[11px] font-extrabold text-rose-600 hover:bg-rose-100/50 hover:scale-[0.98] transition-all cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span>DELETE DECK</span>
          </button>
        </div>
      </header>

      {/* 2. STATS ROW OVERVIEW */}
      <section className="bg-card rounded-3xl p-5 border border-border grid grid-cols-3 gap-2 sm:gap-4 text-center">
        <StatItem label="Due" value="0" accent />
        <StatItem label="Mastered" value="0%" />
        <StatItem label="Total" value={cards.length} />
      </section>

      {/* 3. FLUID STUDY ROW LINK */}
      {cards.length > 0 && (
        <Link
          to="/dashboard/review/$deckId"
          params={{ deckId }}
          className="w-full bg-primary text-primary-foreground font-display font-extrabold py-4 rounded-2xl flex items-center justify-center gap-2 hover:scale-[0.98] transition-transform"
        >
          <Play className="size-4.5 fill-current stroke-[2.5]" /> Start Review Session
        </Link>
      )}

      {/* 4. CARDS DIRECTORY & ACCORDIONS */}
      <section className="space-y-4 pt-2">
        <h2 className="font-display text-lg font-extrabold text-foreground px-0.5">Cards List</h2>
        
        {cards.length === 0 ? (
          <div className="border border-dashed border-border rounded-[2.5rem] bg-card p-12 text-center">
            <span className="text-4xl block mb-2">🃏</span>
            <h3 className="font-display text-xl font-extrabold text-foreground">No cards yet</h3>
            <p className="text-xs font-semibold text-muted-foreground mt-2 mb-6">
              This study slot has no flashcards yet. Add one manually or review document presets!
            </p>
            <button
              onClick={() => openCardModal()}
              className="bg-brand text-brand-foreground text-xs font-extrabold px-6 py-3 rounded-2xl hover:scale-[0.98] transition-transform"
            >
              Add Your First Card
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card, idx) => {
              const isOpen = expandedCardId === card.card_id;
              return (
                <article
                  key={card.card_id}
                  onClick={() => setExpandedCardId(isOpen ? null : card.card_id)}
                  className={`border rounded-3xl bg-card p-5 cursor-pointer hover:scale-[1.005] transition-all duration-200 ${
                    isOpen ? "border-primary/45 ring-1 ring-primary/20 bg-primary/[0.01]" : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Index Badge */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background font-display text-xs font-extrabold text-muted-foreground">
                      {idx + 1}
                    </div>

                    {/* Question Content */}
                    <div className="flex-1 min-w-0 pr-2">
                      <p className={`text-sm font-bold text-foreground leading-relaxed ${isOpen ? "" : "line-clamp-2"}`}>
                        <MathText text={card.question} />
                      </p>
                      {isOpen && card.image_url && (
                        <div className="max-w-xs mt-3 rounded-xl overflow-hidden border border-border bg-card">
                          <img src={card.image_url} alt="Question helper" className="w-full h-auto object-contain max-h-32" />
                        </div>
                      )}

                      {/* Expandable answer panel */}
                      {isOpen && (
                        <div className="mt-4 border-t border-border/80 pt-4 space-y-3.5">
                          <div className="bg-background border border-border/80 rounded-2xl p-4 space-y-1.5">
                            <span className="text-[9px] font-extrabold text-primary uppercase tracking-widest block">
                              ANSWER
                            </span>
                            <p className="text-xs sm:text-sm font-semibold text-foreground/80 leading-relaxed">
                              <MathText text={card.answer} />
                            </p>
                          </div>

                          {card.explanation && (
                            <div className="bg-amber-50/20 border border-amber-100 rounded-2xl p-4 space-y-1.5">
                              <span className="text-[9px] font-extrabold text-amber-600 uppercase tracking-widest block">
                                EXPLANATION
                              </span>
                              <p className="text-xs font-semibold text-muted-foreground leading-relaxed">
                                <MathText text={card.explanation} />
                              </p>
                            </div>
                          )}

                          {card.notes_image_url && (
                            <div className="max-w-xs mt-2 rounded-xl overflow-hidden border border-border bg-card">
                              <img src={card.notes_image_url} alt="Explanation context" className="w-full h-auto object-contain max-h-32" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expand and controls */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <button className="text-muted-foreground hover:text-foreground p-1 transition-colors">
                        {isOpen ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>

                      {isOpen && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openCardModal(card);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-primary hover:scale-[1.05] transition-transform cursor-pointer"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteCard(card.card_id, e)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-500 hover:scale-[1.05] transition-transform cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ADD/EDIT CARD MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-6" onClick={() => setModalOpen(false)}>
          <form
            onSubmit={handleSaveCard}
            className="w-full max-w-lg bg-card border border-border rounded-[2.5rem] p-6 space-y-5 max-h-[90vh] overflow-y-auto animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="font-display text-xl font-extrabold text-foreground">
                {editingCardId ? "Edit Study Card" : "Add Study Card"}
              </h3>
              <p className="text-xs font-bold text-muted-foreground">Configure prompt, recall answer, and explanation details</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest pl-1 block">Question / Prompt</label>
                <textarea
                  required
                  placeholder="e.g. What is the powerhouse of the cell?"
                  rows={2}
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  className="w-full border border-border rounded-2xl p-3 bg-background font-semibold text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest pl-1 block">Question Image (Optional)</label>
                {imageUrl ? (
                  <div className="relative w-32 h-20 rounded-xl overflow-hidden border border-border bg-muted">
                    <img src={imageUrl} alt="Question preview" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setImageUrl("")}
                      className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors cursor-pointer backdrop-blur-sm"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 border border-dashed border-border rounded-xl px-4 py-2 bg-background hover:bg-muted transition-colors cursor-pointer text-xs font-bold text-muted-foreground">
                    {uploadingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{uploadingImage ? "Uploading..." : "Upload Image"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          void uploadImageFile(e.target.files[0], false);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest pl-1 block">Answer / Recall target</label>
                <textarea
                  required
                  placeholder="e.g. The Mitochondria (ATP generator)..."
                  rows={2}
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value)}
                  className="w-full border border-border rounded-2xl p-3 bg-background font-semibold text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest pl-1 block">Explanation / Context (Optional)</label>
                <textarea
                  placeholder="e.g. Double membranned organelle conducting Krebs cycle."
                  rows={2}
                  value={newExplanation}
                  onChange={(e) => setNewExplanation(e.target.value)}
                  className="w-full border border-border rounded-2xl p-3 bg-background font-semibold text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest pl-1 block">Explanation Image (Optional)</label>
                {notesImageUrl ? (
                  <div className="relative w-32 h-20 rounded-xl overflow-hidden border border-border bg-muted">
                    <img src={notesImageUrl} alt="Explanation preview" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setNotesImageUrl("")}
                      className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors cursor-pointer backdrop-blur-sm"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 border border-dashed border-border rounded-xl px-4 py-2 bg-background hover:bg-muted transition-colors cursor-pointer text-xs font-bold text-muted-foreground">
                    {uploadingNotesImage ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{uploadingNotesImage ? "Uploading..." : "Upload Image"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingNotesImage}
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          void uploadImageFile(e.target.files[0], true);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingCardId(null);
                }}
                className="flex-1 border border-border bg-background text-foreground font-extrabold text-sm py-3.5 rounded-2xl hover:bg-muted transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingCard || !newQuestion.trim() || !newAnswer.trim()}
                className="flex-1 flex items-center justify-center bg-primary text-primary-foreground font-extrabold text-sm py-3.5 rounded-2xl hover:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer"
              >
                {savingCard ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Card"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

type StatItemProps = {
  label: string;
  value: string | number;
  accent?: boolean;
};

function StatItem({ label, value, accent }: StatItemProps) {
  return (
    <div>
      <div className={`font-display font-extrabold text-2xl ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest mt-1">
        {label}
      </div>
    </div>
  );
}
