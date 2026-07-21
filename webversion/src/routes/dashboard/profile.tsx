import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { SignOutButton, useAuth, useUser } from "@clerk/tanstack-react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AtSign,
  Camera,
  ChevronRight,
  Crown,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  LifeBuoy,
  Link2,
  Loader2,
  LogOut,
  Mail,
  Shield,
  Trash2,
  UserRound,
  X,
  Copy,
  Check,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSyncUser, useSubscriptionStatus, useBillingHistory } from "@/lib/queries";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/profile")({
  component: ProfilePage,
});

type ModalName = "profile" | "password" | null;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const clerkError = error as {
      errors?: Array<{ longMessage?: string; message?: string; code?: string }>;
      message?: string;
    };
    const first = clerkError.errors?.[0];
    return first?.longMessage ?? first?.message ?? first?.code ?? clerkError.message ?? "Something went wrong";
  }
  return String(error);
}

function ProfilePage() {
  const { user, isLoaded } = useUser();
  const { getToken, signOut } = useAuth();
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [activeModal, setActiveModal] = useState<ModalName>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const syncUserQuery = useSyncUser();
  const subscriptionQuery = useSubscriptionStatus();
  const historyQuery = useBillingHistory();

  const dbUser = syncUserQuery.data?.user;
  const subscriptionStatus = subscriptionQuery.data;

  const [restoring, setRestoring] = useState(false);

  const handleRestorePurchases = async () => {
    setRestoring(true);
    try {
      const result = await apiFetch<any>("/billing/restore", {
        method: "POST",
        getToken,
      });
      if (result.success) {
        toast.success(`Entitlements restored successfully! Restored ${result.restored_count} purchases.`);
        await subscriptionQuery.refetch();
        await historyQuery.refetch();
      } else {
        toast.error(result.message || "Failed to restore purchases.");
      }
    } catch (err: any) {
      toast.error(err?.message || "An error occurred during restore.");
    } finally {
      setRestoring(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
  }, [user]);

  const remainingDays = useMemo(() => {
    if (!dbUser?.scheduled_deletion_at) return null;
    const diff = new Date(dbUser.scheduled_deletion_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [dbUser]);

  const profile = useMemo(() => {
    const name = user?.fullName ?? user?.firstName ?? user?.username ?? "Study Scholar";
    return {
      name,
      email: user?.primaryEmailAddress?.emailAddress ?? "",
      initial: (user?.firstName?.[0] ?? user?.fullName?.[0] ?? user?.username?.[0] ?? "U").toUpperCase(),
    };
  }, [user]);

  const resetProfileForm = () => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
  };

  const updateProfile = async () => {
    if (!user) return;
    setBusy("profile");
    try {
      await user.update({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      });
      setActiveModal(null);
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const updateAvatar = async (file?: File) => {
    if (!user || !file) return;
    setBusy("avatar");
    try {
      await user.setProfileImage({ file });
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setBusy(null);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const updatePassword = async () => {
    if (!user) return;
    if (newPassword.length < 8) {
      alert("Use at least 8 characters for your password.");
      return;
    }

    setBusy("password");
    try {
      await user.updatePassword({
        currentPassword: user.passwordEnabled ? currentPassword : undefined,
        newPassword,
        signOutOfOtherSessions: true,
      });
      setCurrentPassword("");
      setNewPassword("");
      setActiveModal(null);
      alert("Password updated.");
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const disconnectExternalAccount = async (accountId: string, label: string) => {
    if (!user) return;
    const account = user.externalAccounts.find((item) => item.id === accountId);
    if (!account) return;

    if (!user.passwordEnabled && user.externalAccounts.length <= 1) {
      alert("Add password sign-in before disconnecting your only social login.");
      return;
    }

    if (!confirm(`Disconnect ${label} from your PikaDecks account?`)) return;

    setBusy(accountId);
    try {
      await account.destroy();
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    setBusy("delete");
    try {
      await apiFetch("/delete-user", { method: "DELETE", getToken });
      setDeleteModalOpen(false);
      alert("Your account deletion has been scheduled. You will be signed out now.");
      await signOut();
      router.navigate({ to: "/" });
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 pb-24 font-sans sm:px-6">
      <section className="border-b border-border pb-4">
        <h1 className="font-display text-3xl font-extrabold text-foreground">Settings & Profile</h1>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          PikaDecks account controls powered securely by Clerk.
        </p>
      </section>

      {remainingDays !== null && remainingDays > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl flex items-center gap-2 font-bold text-sm">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <span>Account scheduled for deletion in {remainingDays} days.</span>
        </div>
      )}

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void updateAvatar(event.target.files?.[0])}
          />
          <button
            onClick={() => avatarInputRef.current?.click()}
            className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border border-border bg-brand/30 text-primary transition-transform hover:scale-[0.99]"
          >
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt={profile.name} className="h-full w-full rounded-3xl object-cover" />
            ) : (
              <span className="font-display text-3xl font-extrabold">{profile.initial}</span>
            )}
            <span className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground">
              {busy === "avatar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </span>
          </button>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="truncate font-display text-xl font-extrabold text-foreground">{profile.name}</h2>
            <p className="mt-1 truncate text-sm font-semibold text-muted-foreground">{profile.email}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              <button
                onClick={() => {
                  resetProfileForm();
                  setActiveModal("profile");
                }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-extrabold text-foreground hover:bg-muted"
              >
                <UserRound className="h-4 w-4 text-primary" />
                Edit profile
              </button>
              <button
                onClick={() => setActiveModal("password")}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-extrabold text-foreground hover:bg-muted"
              >
                <KeyRound className="h-4 w-4 text-primary" />
                {user?.passwordEnabled ? "Password" : "Add password"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Billing & Subscriptions Settings Section */}
      <SettingsSection title="Billing & History" caption="Manage your payments and view subscription details.">
        <SettingsLink
          to="/dashboard/billing/history"
          icon={CreditCard}
          title="Subscription History"
          description="View all detailed transaction logs, receipts, and order histories"
          last
        />
      </SettingsSection>

      {/* Redesigned Membership & Pro Status Section */}
      <section className="rounded-3xl border border-border bg-card p-6 space-y-6">
        <div className="flex flex-col sm:flex-row gap-5 sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-brand-soft text-primary">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary">Membership</p>
              <h2 className="mt-1 text-xl font-extrabold text-foreground">
                {subscriptionStatus?.is_pro ? "PikaDecks Pro" : "Free Study Plan"}
              </h2>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {subscriptionStatus?.is_pro 
                  ? "Enjoying unlimited AI generations and priority processing queue."
                  : "Upgrade to unlock unlimited AI generations and priority processing."}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            {!subscriptionStatus?.is_pro ? (
              <Link
                to="/dashboard/billing"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-brand-ink px-5 py-2.5 text-xs font-extrabold transition-all hover:scale-[0.99] active:scale-[0.97]"
              >
                <CreditCard className="h-4 w-4" />
                Go Pro
              </Link>
            ) : (
              <>
                {subscriptionStatus.subscription?.platform === "android" ? (
                  <a
                    href="https://play.google.com/store/account/subscriptions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-brand-ink px-5 py-2.5 text-xs font-extrabold transition-all hover:scale-[0.99] active:scale-[0.97]"
                  >
                    <CreditCard className="h-4 w-4" />
                    Manage Billing
                  </a>
                ) : (
                  <Link
                    to="/dashboard/billing"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-brand-ink px-5 py-2.5 text-xs font-extrabold transition-all hover:scale-[0.99] active:scale-[0.97]"
                  >
                    <CreditCard className="h-4 w-4" />
                    Manage Billing
                  </Link>
                )}
                <button
                  onClick={handleRestorePurchases}
                  disabled={restoring}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 py-2.5 text-xs font-extrabold hover:bg-muted transition-all disabled:opacity-60"
                >
                  {restoring ? "Restoring..." : "Restore Purchases"}
                </button>
              </>
            )}
          </div>
        </div>

        {subscriptionStatus?.is_pro && subscriptionStatus.subscription && (
          <div className="pt-4 border-t border-border/60 grid gap-4 grid-cols-2 sm:grid-cols-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Status</span>
              <p className="mt-0.5 text-sm font-extrabold text-emerald-600 capitalize">
                {subscriptionStatus.subscription.status || "Active"}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Subscription Source</span>
              <p className="mt-0.5 text-sm font-extrabold text-foreground">
                {subscriptionStatus.subscription.platform === "android" ? "Google Play" : "Website"}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Auto Renew</span>
              <p className="mt-0.5 text-sm font-extrabold text-foreground">
                {subscriptionStatus.subscription.auto_renewing ? "Enabled" : "Disabled"}
              </p>
            </div>
            {subscriptionStatus.subscription.auto_renewing ? (
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Renewal Date</span>
                <p className="mt-0.5 text-sm font-extrabold text-foreground">
                  {subscriptionStatus.subscription.expires_at ? new Date(subscriptionStatus.subscription.expires_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "N/A"}
                </p>
              </div>
            ) : (
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Expiry Date</span>
                <p className="mt-0.5 text-sm font-extrabold text-rose-600">
                  {subscriptionStatus.subscription.expires_at ? new Date(subscriptionStatus.subscription.expires_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "N/A"}
                </p>
              </div>
            )}
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Membership Since</span>
              <p className="mt-0.5 text-sm font-extrabold text-foreground">
                {subscriptionStatus.subscription.purchase_date || subscriptionStatus.subscription.created_at ? new Date(subscriptionStatus.subscription.purchase_date || subscriptionStatus.subscription.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "N/A"}
              </p>
            </div>
          </div>
        )}

        {subscriptionStatus?.is_pro && !subscriptionStatus.subscription?.auto_renewing && subscriptionStatus.subscription?.expires_at && (
          <div className="bg-amber-500/10 border border-amber-200 text-amber-800 p-4 rounded-2xl text-xs font-bold leading-relaxed">
            Your Pro membership remains active until {new Date(subscriptionStatus.subscription.expires_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.
          </div>
        )}
      </section>



      <SettingsSection title="Connected accounts" caption="OAuth account state from Clerk, shown with PikaDecks UI.">
        {user?.externalAccounts.length ? (
          user.externalAccounts.map((account, index) => {
            const label = account.providerTitle?.() ?? account.provider.replace("oauth_", "");
            return (
              <SettingsButton
                key={account.id}
                icon={Link2}
                title={label}
                description={account.emailAddress || account.accountIdentifier?.()}
                actionLabel={busy === account.id ? "Working..." : "Disconnect"}
                dangerAction
                last={index === user.externalAccounts.length - 1}
                onClick={() => void disconnectExternalAccount(account.id, label)}
              />
            );
          })
        ) : (
          <SettingsButton
            icon={Link2}
            title="No social account connected"
            description="Sign in with Google once to link it to this account."
            last
          />
        )}
      </SettingsSection>

      <SettingsSection title="Legal & Policies" caption="Public pages required for trust and app review.">
        <SettingsLink to="/support" icon={LifeBuoy} title="Support" description="Get help with login, uploads, billing, and AI generation" />
        <SettingsLink to="/contact" icon={Mail} title="Contact" description="Reach the PikaDecks team for product or privacy questions" />
        <SettingsLink to="/privacy" icon={Shield} title="Privacy Policy" description="Read how we protect and manage your study data" />
        <SettingsLink to="/delete-account" icon={Trash2} title="Delete account policy" description="Review what is deleted and retained" />
        <SettingsLink to="/terms" icon={FileText} title="Terms & Conditions" description="Review our service conditions and guidelines" last />
      </SettingsSection>

      <section className="space-y-4">
        <h3 className="pl-1 text-xs font-extrabold uppercase tracking-widest text-rose-500">Danger Zone</h3>
        <div className="space-y-3">
          <SignOutButton>
            <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/50 py-4 text-sm font-bold text-rose-600 transition-all hover:scale-[0.99] hover:bg-rose-100/50">
              <LogOut className="h-4 w-4" />
              <span>SIGN OUT</span>
            </button>
          </SignOutButton>

          <button
            onClick={() => setDeleteModalOpen(true)}
            disabled={busy === "delete"}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 py-4 text-sm font-extrabold text-white transition-all hover:scale-[0.99] hover:bg-rose-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            <span>DELETE ACCOUNT</span>
          </button>
        </div>
      </section>

      <footer className="pt-6 text-center text-[11px] font-semibold text-muted-foreground">
        Pikadecks App v1.0.0 - All rights reserved
      </footer>

      <ProfileModal
        open={activeModal === "profile"}
        busy={busy === "profile"}
        firstName={firstName}
        lastName={lastName}
        onFirstName={setFirstName}
        onLastName={setLastName}
        onClose={() => setActiveModal(null)}
        onSave={updateProfile}
      />

      <PasswordModal
        open={activeModal === "password"}
        busy={busy === "password"}
        passwordEnabled={!!user?.passwordEnabled}
        currentPassword={currentPassword}
        newPassword={newPassword}
        onCurrentPassword={setCurrentPassword}
        onNewPassword={setNewPassword}
        onClose={() => setActiveModal(null)}
        onSave={updatePassword}
      />

      <AccountModal
        open={deleteModalOpen}
        title="Delete Account?"
        subtitle="Review soft-delete terms before proceeding."
        onClose={() => setDeleteModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="text-sm font-semibold text-muted-foreground space-y-3">
            <p>
              Your account, decks, reviews, analytics, and related data will be scheduled for deletion.
            </p>
            <p>
              You can restore your account anytime within <strong className="text-foreground font-extrabold">7 days</strong> by simply logging in again.
            </p>
            <p>
              After the 7-day recovery period ends, all account data will be permanently deleted and cannot be recovered.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              disabled={busy === "delete"}
              onClick={handleDeleteAccount}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-rose-600 text-sm font-extrabold text-white transition hover:scale-[0.99] disabled:opacity-60"
            >
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Schedule Account Deletion"}
            </button>
            <button
              disabled={busy === "delete"}
              onClick={() => setDeleteModalOpen(false)}
              className="flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-background text-sm font-extrabold text-foreground transition hover:bg-muted"
            >
              Cancel
            </button>
            <div className="text-center pt-2">
              <Link
                to="/delete-account"
                className="text-xs font-bold text-primary hover:underline"
              >
                View Deletion Policy
              </Link>
            </div>
          </div>
        </div>
      </AccountModal>
    </div>
  );
}

function SettingsSection({ caption, children, title }: { caption: string; children: React.ReactNode; title: string }) {
  return (
    <section className="space-y-4">
      <div className="pl-1">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">{title}</h3>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">{caption}</p>
      </div>
      <div className="overflow-hidden rounded-3xl border border-border bg-card">{children}</div>
    </section>
  );
}

function SettingsLink(props: {
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  last?: boolean;
  title: string;
  to: string;
}) {
  return (
    <Link to={props.to} className="block">
      <SettingsButton {...props} />
    </Link>
  );
}

function SettingsButton({
  actionLabel,
  dangerAction,
  description,
  icon: Icon,
  last,
  onClick,
  title,
}: {
  actionLabel?: string;
  dangerAction?: boolean;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  last?: boolean;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50 ${last ? "" : "border-b border-border"}`}
    >
      <span className="text-muted-foreground transition-colors group-hover:text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        {description ? <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{description}</span> : null}
      </span>
      {actionLabel ? (
        <span className={`text-[11px] font-extrabold ${dangerAction ? "text-rose-500" : "text-primary"}`}>{actionLabel}</span>
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

function ProfileModal(props: {
  busy: boolean;
  firstName: string;
  lastName: string;
  onClose: () => void;
  onFirstName: (value: string) => void;
  onLastName: (value: string) => void;
  onSave: () => void;
  open: boolean;
}) {
  return (
    <AccountModal open={props.open} title="Edit profile" subtitle="Update the details shown across PikaDecks." onClose={props.onClose}>
      <Field label="First name" value={props.firstName} onChange={props.onFirstName} />
      <Field label="Last name" value={props.lastName} onChange={props.onLastName} />
      <PrimaryButton busy={props.busy} label="Save profile" onClick={props.onSave} />
    </AccountModal>
  );
}

function PasswordModal(props: {
  busy: boolean;
  currentPassword: string;
  newPassword: string;
  onClose: () => void;
  onCurrentPassword: (value: string) => void;
  onNewPassword: (value: string) => void;
  onSave: () => void;
  open: boolean;
  passwordEnabled: boolean;
}) {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  return (
    <AccountModal
      open={props.open}
      title={props.passwordEnabled ? "Change password" : "Add password"}
      subtitle={props.passwordEnabled ? "Update your password sign-in method." : "Add password sign-in alongside Google login."}
      onClose={props.onClose}
    >
      {props.passwordEnabled ? (
        <PasswordField
          label="Current password"
          value={props.currentPassword}
          onChange={props.onCurrentPassword}
          visible={showCurrentPassword}
          onToggleVisible={() => setShowCurrentPassword((value) => !value)}
        />
      ) : null}
      <PasswordField
        label="New password"
        value={props.newPassword}
        onChange={props.onNewPassword}
        visible={showNewPassword}
        onToggleVisible={() => setShowNewPassword((value) => !value)}
      />
      <PrimaryButton busy={props.busy} label={props.passwordEnabled ? "Update password" : "Add password"} onClick={props.onSave} />
    </AccountModal>
  );
}

function AccountModal({
  children,
  onClose,
  open,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  subtitle: string;
  title: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-[2rem] border border-border bg-card p-6 sm:rounded-[2rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-extrabold text-foreground">{title}</h2>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">{subtitle}</p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-extrabold text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm font-bold text-foreground outline-none ring-primary/20 transition focus:ring-4"
      />
    </label>
  );
}

function PasswordField({
  label,
  onChange,
  onToggleVisible,
  value,
  visible,
}: {
  label: string;
  onChange: (value: string) => void;
  onToggleVisible: () => void;
  value: string;
  visible: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-extrabold text-foreground">{label}</span>
      <span className="flex h-12 w-full items-center rounded-2xl border border-border bg-background px-4 ring-primary/20 transition focus-within:ring-4">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function PrimaryButton({ busy, label, onClick }: { busy: boolean; label: string; onClick: () => void }) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground transition hover:scale-[0.99] disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </button>
  );
}
