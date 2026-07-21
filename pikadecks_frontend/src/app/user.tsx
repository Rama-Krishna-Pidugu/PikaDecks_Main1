import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth, useUser } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useToast, ToastOverlay } from '@/components/ui/ToastProvider'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import * as WebBrowser from 'expo-web-browser'
import { restorePurchases } from '@/lib/billing'

import { AuthenticatedShell, ui } from '@/components/authenticated-shell'
import { LockedFeatureModal } from '@/components/LockedFeatureModal'
import { colors, radius, shadows } from '@/constants/theme'
import { EMPTY_STATS, useStats, useStudyStreak } from '@/hooks/useStats'
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus'
import { useBillingHistory } from '@/hooks/useBillingHistory'
import { captureException, clearUserContext } from '@/lib/errors'
import { clearOfflineAuthUser } from '@/lib/offline-auth'
import { teardownPushNotifications, unregisterPushToken } from '@/lib/push-notifications'

type ModalName = 'profile' | 'password' | null
type PdfUsage = {
  used: number
  limit: number | null
  remaining: number | null
  unlimited?: boolean
  plan?: string
  resetsAt?: string
}

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const PROFILE_IMAGE_ERROR = 'Could not update photo. Try a JPG or PNG under 5 MB.'

function inferImageMimeType(uri: string) {
  const lowerUri = uri.toLowerCase()
  if (lowerUri.includes('.png')) return 'image/png'
  if (lowerUri.includes('.jpg') || lowerUri.includes('.jpeg')) return 'image/jpeg'
  return 'image/jpeg'
}

function isAllowedProfileImageType(mimeType: string) {
  return mimeType === 'image/jpeg' || mimeType === 'image/jpg' || mimeType === 'image/png'
}

function getProfileImageName(uri: string, mimeType: string) {
  const fallbackExtension = mimeType === 'image/png' ? 'png' : 'jpg'
  const fileName = uri.split('/').pop()?.split('?')[0]
  if (fileName && /\.(jpe?g|png)$/i.test(fileName)) return fileName
  return `profile.${fallbackExtension}`
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const clerkError = error as { errors?: Array<{ longMessage?: string; message?: string; code?: string }>; message?: string }
    const first = clerkError.errors?.[0]
    return first?.longMessage ?? first?.message ?? first?.code ?? clerkError.message ?? 'Something went wrong'
  }
  return String(error)
}

export default function UserPage() {
  const { getToken, signOut } = useAuth()
  const getTokenRef = useRef(getToken)
  const getSubscriptionToken = useCallback(() => getTokenRef.current(), [])
  const { user } = useUser()
  const router = useRouter()
  const { showToast } = useToast()
  const [activeModal, setActiveModal] = useState<ModalName>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [referralModalVisible, setReferralModalVisible] = useState(false)
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false)
  const { status: subscriptionStatus, refresh: refreshSubscription } = useSubscriptionStatus(getSubscriptionToken)
  const { data: historyData, refetch: refetchHistory } = useBillingHistory(getSubscriptionToken)
  const { data: stats = EMPTY_STATS } = useStats()
  const { data: streakData } = useStudyStreak()
  const [restoring, setRestoring] = useState(false)

  const handleRestore = async () => {
    try {
      setRestoring(true)
      const latestStatus = await restorePurchases(getSubscriptionToken)
      await refreshSubscription()
      await refetchHistory()
      const msg = latestStatus?.is_pro
        ? 'Your Pro access is active.'
        : 'No active Pro purchase was found.';
      showToast(msg, latestStatus?.is_pro ? 'success' : 'warning');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not restore purchases.', 'error')
    } finally {
      setRestoring(false)
    }
  }
  const [pdfUsage, setPdfUsage] = useState<PdfUsage>({
    used: 0,
    limit: 10,
    remaining: 10,
    unlimited: false,
    plan: 'free',
  })

  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [dbUser, setDbUser] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    const fetchDbUser = async () => {
      try {
        const token = await getToken()
        const apiUrl = process.env.EXPO_PUBLIC_API_URL
        if (!token || !apiUrl) return
        const response = await fetch(`${apiUrl}/sync-user`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        })
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled && data?.user) setDbUser(data.user)
      } catch (error) {
        // ignore
      }
    }
    void fetchDbUser()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remainingDays = useMemo(() => {
    if (!dbUser?.scheduled_deletion_at) return null
    const diff = new Date(dbUser.scheduled_deletion_at).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }, [dbUser])

  useEffect(() => {
    getTokenRef.current = getToken
  }, [getToken])

  useEffect(() => {
    let cancelled = false
    const loadUsage = async () => {
      try {
        const token = await getTokenRef.current()
        const apiUrl = process.env.EXPO_PUBLIC_API_URL
        if (!token || !apiUrl) return
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        const response = await fetch(`${apiUrl}/uploads/usage?timezone=${encodeURIComponent(timezone)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled && data?.usage) setPdfUsage(data.usage)
      } catch (error) {
        captureException(error, { feature: 'user', action: 'load_pdf_usage' })
      }
    }

    void loadUsage()
    return () => {
      cancelled = true
    }
  }, [subscriptionStatus?.is_pro])

  const profile = useMemo(() => {
    const name = user?.fullName ?? user?.firstName ?? user?.username ?? 'User'
    return {
      name,
      email: user?.primaryEmailAddress?.emailAddress ?? 'Signed in with PikaDecks',
      initial: (user?.firstName?.[0] ?? user?.fullName?.[0] ?? user?.username?.[0] ?? 'U').toUpperCase(),
      imageUrl: user?.imageUrl,
      plan: subscriptionStatus?.is_pro ? 'Pro' : 'Free',
    }
  }, [subscriptionStatus?.is_pro, user])

  const resetProfileForm = () => {
    setFirstName(user?.firstName ?? '')
    setLastName(user?.lastName ?? '')
  }

  const openUrl = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url)
    } catch (error) {
      captureException(error, { feature: 'user', action: 'open_external_url' })
    }
  }

  const updateProfile = async () => {
    if (!user) return
    try {
      setBusy('profile')
      await user.update({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      })
      setActiveModal(null)
    } catch (error) {
      captureException(error, { feature: 'user', action: 'update_profile' })
      showToast(getErrorMessage(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const updateAvatar = async () => {
    if (!user) return
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        showToast('Allow photo access to update your profile picture.', 'error')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      })

      if (result.canceled || !result.assets?.[0]?.uri) return

      const asset = result.assets[0]
      const mimeType = asset.mimeType ?? inferImageMimeType(asset.uri)
      if (!isAllowedProfileImageType(mimeType) || (asset.fileSize ?? 0) > PROFILE_IMAGE_MAX_BYTES) {
        showToast(PROFILE_IMAGE_ERROR, 'error')
        return
      }
      if (!asset.base64) {
        showToast(PROFILE_IMAGE_ERROR, 'error')
        return
      }

      setBusy('avatar')
      console.log(`[Avatar Upload] Base64 string length: ${asset.base64.length}`);
      const file = asset.base64
      console.log(`[Avatar Upload] Calling user.setProfileImage()`);
      await user.setProfileImage({ file })
      console.log(`[Avatar Upload] Image set successfully, reloading user`);
      await user.reload()
      console.log(`[Avatar Upload] Reload complete`);
    } catch (error) {
      console.error(`[Avatar Upload] Exception caught:`, error);
      captureException(error, { feature: 'user', action: 'update_avatar', extra: { message: getErrorMessage(error) } })
      showToast(PROFILE_IMAGE_ERROR, 'error')
    } finally {
      setBusy(null)
    }
  }

  const updatePassword = async () => {
    if (!user) return
    if (newPassword.length < 8) {
      showToast('Use at least 8 characters.', 'error')
      return
    }

    try {
      setBusy('password')
      await user.updatePassword({
        currentPassword: user.passwordEnabled ? currentPassword : undefined,
        newPassword,
        signOutOfOtherSessions: true,
      })
      setCurrentPassword('')
      setNewPassword('')
      setActiveModal(null)
      showToast('Your PikaDecks password sign-in is ready.', 'success')
    } catch (error) {
      captureException(error, { feature: 'user', action: 'update_password' })
      showToast(getErrorMessage(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteAccountData = () => {
    setDeleteConfirmVisible(true)
  }

  const confirmDeleteAccountData = async () => {
    try {
      setBusy('delete')
      const token = await getToken()
      const apiUrl = process.env.EXPO_PUBLIC_API_URL
      if (!token || !apiUrl) throw new Error('Missing API credentials or authentication token.')

      const res = await fetch(`${apiUrl}/delete-user`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) throw new Error('Could not delete account data. Please contact support.')

      setDeleteConfirmVisible(false)
      clearUserContext()
      await clearOfflineAuthUser()
      await signOut()
      router.replace('/')
    } catch (error) {
      captureException(error, { feature: 'user', action: 'delete_account_data' })
      showToast(getErrorMessage(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleLogout = async () => {
    if (busy === 'logout') return

    try {
      setBusy('logout')
      await unregisterPushToken(getToken)
      teardownPushNotifications()
      clearUserContext()
      await clearOfflineAuthUser()
      await signOut()
      router.replace('/')
    } catch (error) {
      captureException(error, { feature: 'user', action: 'logout' })
      showToast(getErrorMessage(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <AuthenticatedShell title="User" subtitle="Manage your account" hideHeader>
      <LockedFeatureModal
        visible={referralModalVisible}
        onClose={() => setReferralModalVisible(false)}
        title="Referral Program"
        badge="Coming Soon"
        description="PikaDecks Referral Program is currently locked. You'll soon be able to invite friends and unlock premium Pro templates."
        iconName="users"
      />
      <DeleteAccountModal
        visible={deleteConfirmVisible}
        busy={busy === 'delete'}
        onClose={() => setDeleteConfirmVisible(false)}
        onViewPolicy={() => void openUrl('https://pikadecks.app/delete-account?webview=true')}
        onConfirm={confirmDeleteAccountData}
      />

      <View style={styles.body}>
        {remainingDays !== null && remainingDays > 0 ? (
          <View style={{ backgroundColor: '#fffbeb', borderColor: '#fef3c7', borderWidth: 1, padding: 16, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Feather name="alert-triangle" size={16} color="#d97706" />
            <Text style={{ color: '#b45309', fontWeight: 'bold', fontSize: 13 }}>Account scheduled for deletion in {remainingDays} days.</Text>
          </View>
        ) : null}
        <View style={styles.profileHero}>
          <Pressable style={styles.avatarRing} onPress={updateAvatar} disabled={busy === 'avatar'}>
            {profile.imageUrl ? (
              <Image source={{ uri: profile.imageUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{profile.initial}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              {busy === 'avatar' ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="camera" size={14} color={colors.primary} />}
            </View>
          </Pressable>

          <Text style={styles.name} numberOfLines={1}>{profile.name}</Text>
          <Text style={styles.email} numberOfLines={1}>{profile.email}</Text>

          <View style={styles.heroActions}>
            <PillButton icon="edit-3" label="Edit profile" onPress={() => { resetProfileForm(); setActiveModal('profile') }} />
            <PillButton icon="key" label={user?.passwordEnabled ? 'Password' : 'Add password'} onPress={() => setActiveModal('password')} />
          </View>

          <View style={[styles.planChip, subscriptionStatus?.is_pro && styles.planChipPremium]}>
            <Feather name={subscriptionStatus?.is_pro ? 'check-circle' : 'star'} size={11} color={subscriptionStatus?.is_pro ? '#047857' : ui.purple} />
            <Text style={[styles.planChipText, subscriptionStatus?.is_pro && styles.planChipTextPremium]}>{profile.plan.toUpperCase()} PLAN</Text>
          </View>
        </View>

        <MembershipCard
          isPro={!!subscriptionStatus?.is_pro}
          usage={pdfUsage}
          currentStreak={streakData?.current_streak ?? stats.current_streak ?? 0}
          reviewsToday={stats.cards_reviewed_today}
          onUpgrade={() => router.push('/billing' as any)}
          subscriptionStatus={subscriptionStatus}
          onRestore={handleRestore}
          restoring={restoring}
          history={historyData?.history || []}
        />




        <Pressable style={styles.referralCard} onPress={() => setReferralModalVisible(true)}>
          <View style={styles.referralIcon}><Feather name="users" size={20} color={colors.primary} /></View>
          <View style={styles.referralCopy}>
            <Text style={styles.referralTitle}>Referral Program</Text>
            <Text style={styles.referralSub}>Invite friends and unlock Pro rewards soon</Text>
          </View>
          <View style={styles.lockBadge}><Feather name="lock" size={12} color={colors.mutedForeground} /></View>
        </Pressable>



        <SectionHeader title="Billing & History" caption="Manage subscriptions and view receipts" />
        <View style={[styles.settingsCard, { marginBottom: 16 }]}>
          <SettingsRow
            iconName="credit-card"
            label="Subscription History"
            detail="View transaction logs and orders"
            last
            onPress={() => router.push('/subscription-history' as any)}
          />
        </View>

        <SectionHeader title="Account" caption="Preferences, security, and support" />
        <View style={styles.settingsCard}>
          <SettingsRow iconName="shield" label="Privacy Policy" onPress={() => void openUrl('https://pikadecks.app/privacy')} />
          <SettingsRow iconName="file-text" label="Terms & Conditions" onPress={() => void openUrl('https://pikadecks.app/terms')} />
          <SettingsRow iconName="life-buoy" label="Support Center" detail="Login, uploads, AI generation, and billing help" onPress={() => void openUrl('https://pikadecks.app/support')} />
          <SettingsRow iconName="mail" label="Contact PikaDecks" detail="support, privacy, and general contact" onPress={() => void openUrl('https://pikadecks.app/contact')} />
          <SettingsRow iconName="trash-2" label={busy === 'delete' ? 'Deleting...' : 'Delete Account & Data'} danger onPress={handleDeleteAccountData} />
          <SettingsRow
            iconName="log-out"
            label={busy === 'logout' ? 'Logging out...' : 'Logout'}
            danger
            last
            onPress={() => void handleLogout()}
          />
        </View>

        <Text style={styles.footer}>PikaDecks v0.1</Text>
      </View>

      <ProfileModal
        visible={activeModal === 'profile'}
        busy={busy === 'profile'}
        firstName={firstName}
        lastName={lastName}
        onFirstName={setFirstName}
        onLastName={setLastName}
        onClose={() => setActiveModal(null)}
        onSave={updateProfile}
      />

      <PasswordModal
        visible={activeModal === 'password'}
        busy={busy === 'password'}
        passwordEnabled={!!user?.passwordEnabled}
        currentPassword={currentPassword}
        newPassword={newPassword}
        onCurrentPassword={setCurrentPassword}
        onNewPassword={setNewPassword}
        onClose={() => setActiveModal(null)}
        onSave={updatePassword}
      />
    </AuthenticatedShell>
  )
}

function SectionHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCaption}>{caption}</Text>
    </View>
  )
}

function PillButton({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.pillButton}>
      <Feather name={icon} size={14} color={colors.primary} />
      <Text style={styles.pillButtonText}>{label}</Text>
    </Pressable>
  )
}

function MembershipCard({
  currentStreak,
  isPro,
  onUpgrade,
  reviewsToday,
  usage,
  subscriptionStatus,
  onRestore,
  restoring,
  history,
}: {
  currentStreak: number
  isPro: boolean
  reviewsToday: number
  usage: PdfUsage
  onUpgrade: () => void
  subscriptionStatus: any
  onRestore: () => void
  restoring: boolean
  history: any[]
}) {
  const pdfValue = usage.unlimited || isPro ? 'Unlimited' : `${usage.remaining ?? 0}/${usage.limit ?? 10}`
  const aiValue = usage.unlimited || isPro ? 'Unlimited' : `${usage.remaining ?? 0}/${usage.limit ?? 10}`

  const sub = subscriptionStatus?.subscription;
  const isCancelled = sub?.status === 'cancelled';
  const autoRenew = !!sub?.auto_renewing;

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyTx = (txId: string, itemId: string) => {
    const { Clipboard } = require('react-native');
    Clipboard.setString(txId);
    setCopiedId(itemId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const handleManage = () => {
    if (sub?.platform === 'android') {
      const { Linking } = require('react-native');
      const sku = sub?.product_id || 'pikadecks_pro_monthly';
      const url = `https://play.google.com/store/account/subscriptions?package=com.nameisrk.pikadecks&sku=${sku}`;
      Linking.openURL(url).catch((err: any) => console.error("Couldn't open subscription link", err));
    } else {
      onUpgrade();
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.membershipCard}>
        <View style={styles.membershipTop}>
          <View>
            <Text style={styles.membershipEyebrow}>Membership</Text>
            <Text style={styles.membershipTitle}>{isPro ? 'PikaDecks Pro' : 'Free Study Plan'}</Text>
          </View>
          <View style={[styles.membershipBadge, isPro && styles.membershipBadgePro]}>
            <Feather name={isPro ? 'zap' : 'star'} size={12} color={isPro ? '#047857' : colors.primary} />
            <Text style={[styles.membershipBadgeText, isPro && styles.membershipBadgeTextPro]}>{isPro ? 'PRO' : 'FREE'}</Text>
          </View>
        </View>
        
        <View style={styles.membershipStats}>
          <MembershipMetric label="PDFs" value={pdfValue} icon="file-text" />
          <MembershipMetric label="AI generations" value={aiValue} icon="cpu" />
          <MembershipMetric label="Streak" value={`${currentStreak}d`} icon="zap" />
        </View>

        {isPro && sub && (
          <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>Status</Text>
              <Text style={{ fontWeight: '700', fontSize: 12, color: '#10b981', textTransform: 'capitalize' }}>{sub.status || 'Active'}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>Source</Text>
              <Text style={{ fontWeight: '700', fontSize: 12 }}>{sub.platform === 'android' ? 'Google Play' : 'Website'}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>Auto Renew</Text>
              <Text style={{ fontWeight: '700', fontSize: 12 }}>{autoRenew ? 'Enabled' : 'Disabled'}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>{autoRenew ? 'Renews' : 'Expires'}</Text>
              <Text style={{ fontWeight: '700', fontSize: 12, color: autoRenew ? colors.foreground : '#e11d48' }}>{formatDate(sub.expires_at)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>Member Since</Text>
              <Text style={{ fontWeight: '700', fontSize: 12 }}>{formatDate(sub.purchase_date || sub.created_at)}</Text>
            </View>
          </View>
        )}

        {isPro && isCancelled && sub?.expires_at && (
          <View style={{ backgroundColor: '#fffbeb', borderColor: '#fef3c7', borderWidth: 1, padding: 12, borderRadius: radius.lg, marginTop: 4 }}>
            <Text style={{ color: '#b45309', fontSize: 11, fontWeight: '700', lineHeight: 16 }}>
              Your Pro membership remains active until {formatDate(sub.expires_at)}.
            </Text>
          </View>
        )}

        <View style={styles.membershipFooter}>
          <Text style={styles.membershipNote}>{reviewsToday > 0 ? `${reviewsToday} cards reviewed today` : 'Ready for your next study sprint'}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {isPro && (
              <Pressable onPress={onRestore} disabled={restoring} style={[styles.membershipCta, { backgroundColor: '#f3f4f6' }]}>
                <Text style={[styles.membershipCtaText, { color: colors.foreground }]}>{restoring ? 'Restoring...' : 'Restore'}</Text>
              </Pressable>
            )}
            <Pressable onPress={isPro ? handleManage : onUpgrade} style={styles.membershipCta}>
              <Text style={styles.membershipCtaText}>{isPro ? 'Manage' : 'Upgrade'}</Text>
              <Feather name="arrow-right" size={13} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

function MembershipMetric({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.membershipMetric}>
      <Feather name={icon} size={14} color={colors.primary} />
      <Text style={styles.membershipMetricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.membershipMetricLabel} numberOfLines={1}>{label}</Text>
    </View>
  )
}

function ProfileStat({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.profileStat}>
      <View style={styles.profileStatIcon}><Feather name={icon} size={14} color={colors.primary} /></View>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  )
}

function MiniCheck({ label }: { label: string }) {
  return (
    <View style={styles.miniCheck}>
      <Feather name="check" size={10} color="#ffffff" />
      <Text style={styles.miniCheckText}>{label}</Text>
    </View>
  )
}

function SettingsRow({
  actionLabel,
  danger,
  detail,
  iconName,
  label,
  last,
  onPress,
}: {
  actionLabel?: string
  danger?: boolean
  detail?: string
  iconName: keyof typeof Feather.glyphMap
  label: string
  last?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[styles.settingsRow, !last && styles.rowBorder]}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Feather name={iconName} size={17} color={danger ? colors.danger : ui.purple} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, danger && styles.dangerText]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail} numberOfLines={1}>{detail}</Text> : null}
      </View>
      {actionLabel ? (
        <Text style={styles.actionLabel}>{actionLabel}</Text>
      ) : (
        <Feather name="chevron-right" size={18} color={ui.muted} />
      )}
    </Pressable>
  )
}

function ProfileModal(props: {
  visible: boolean
  busy: boolean
  firstName: string
  lastName: string
  onFirstName: (value: string) => void
  onLastName: (value: string) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <AccountModal visible={props.visible} title="Edit profile" subtitle="Update the profile details shown inside PikaDecks." onClose={props.onClose}>
      <Field label="First name" value={props.firstName} onChangeText={props.onFirstName} />
      <Field label="Last name" value={props.lastName} onChangeText={props.onLastName} />
      <PrimaryButton busy={props.busy} label="Save profile" onPress={props.onSave} />
    </AccountModal>
  )
}

function PasswordModal(props: {
  visible: boolean
  busy: boolean
  passwordEnabled: boolean
  currentPassword: string
  newPassword: string
  onCurrentPassword: (value: string) => void
  onNewPassword: (value: string) => void
  onClose: () => void
  onSave: () => void
}) {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  return (
    <AccountModal
      visible={props.visible}
      title={props.passwordEnabled ? 'Change password' : 'Add password'}
      subtitle={props.passwordEnabled ? 'Update your password sign-in method.' : 'Add password sign-in alongside your connected accounts.'}
      onClose={props.onClose}
    >
      {props.passwordEnabled ? (
        <PasswordField
          label="Current password"
          value={props.currentPassword}
          onChangeText={props.onCurrentPassword}
          visible={showCurrentPassword}
          onToggleVisible={() => setShowCurrentPassword((value) => !value)}
        />
      ) : null}
      <PasswordField
        label="New password"
        value={props.newPassword}
        onChangeText={props.onNewPassword}
        visible={showNewPassword}
        onToggleVisible={() => setShowNewPassword((value) => !value)}
      />
      <PrimaryButton busy={props.busy} label={props.passwordEnabled ? 'Update password' : 'Add password'} onPress={props.onSave} />
    </AccountModal>
  )
}

function AccountModal({
  children,
  onClose,
  subtitle,
  title,
  visible,
}: {
  children: React.ReactNode
  onClose: () => void
  subtitle: string
  title: string
  visible: boolean
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalKeyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.modalHandle} />
              <View style={styles.modalTitleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{title}</Text>
                  <Text style={styles.modalSubtitle}>{subtitle}</Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeButton}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Field({
  label,
  ...inputProps
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  secureTextEntry?: boolean
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.mutedForeground}
        style={styles.fieldInput}
      />
    </View>
  )
}

function PasswordField({
  label,
  onChangeText,
  onToggleVisible,
  value,
  visible,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  visible: boolean
  onToggleVisible: () => void
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.passwordInputWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          style={styles.passwordInput}
        />
        <Pressable onPress={onToggleVisible} style={styles.eyeButton} hitSlop={8}>
          <Feather name={visible ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  )
}

function PrimaryButton({ busy, label, onPress }: { busy: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable disabled={busy} onPress={onPress} style={[styles.primaryButton, busy && styles.disabledButton]}>
      {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </Pressable>
  )
}

function DeleteAccountModal({
  busy,
  onClose,
  onConfirm,
  onViewPolicy,
  visible,
}: {
  busy: boolean
  onClose: () => void
  onConfirm: () => void
  onViewPolicy: () => void
  visible: boolean
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={busy ? undefined : onClose}>
      <View style={styles.deleteOverlay}>
        <View style={styles.deleteCard}>
          <View style={styles.deleteHeader}>
            <View style={styles.deleteIconWrap}>
              <Feather name="alert-triangle" size={24} color={colors.danger} />
            </View>
            <View style={styles.deleteContent}>
              <Text style={styles.deleteTitle}>Delete Account?</Text>
              <Text style={styles.deleteMessage}>
                Your account, decks, reviews, analytics, and related data will be scheduled for deletion.{"\n\n"}
                You can restore your account anytime within 7 days by simply logging in again.{"\n\n"}
                After the 7-day recovery period ends, all account data will be permanently deleted and cannot be recovered.
              </Text>
            </View>
          </View>

          <View style={styles.deleteActions}>
            <Pressable
              disabled={busy}
              onPress={onConfirm}
              style={[styles.deletePrimary, busy && styles.disabledButton]}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.deletePrimaryText}>Schedule Account Deletion</Text>
              )}
            </Pressable>
            <Pressable disabled={busy} onPress={onViewPolicy} style={styles.deletePolicy}>
              <Text style={styles.deletePolicyText}>View Deletion Policy</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={onClose} style={styles.deleteCancel}>
              <Text style={styles.deleteCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 16,
  },
  profileHero: {
    backgroundColor: '#fffaf5',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    ...shadows.soft,
  },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#fae4cd',
    borderWidth: 1,
    borderColor: '#f1d3b5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: ui.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: ui.peach,
  },
  cameraBadge: {
    position: 'absolute',
    right: 4,
    bottom: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.card,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  avatarText: {
    color: '#4a2f1e',
    fontSize: 30,
    fontWeight: '900',
  },
  name: {
    color: ui.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 14,
    maxWidth: '92%',
    textAlign: 'center',
  },
  email: {
    color: ui.muted,
    fontSize: 13,
    marginTop: 4,
    maxWidth: '92%',
    textAlign: 'center',
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: radius.full,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  pillButtonText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '900',
  },
  planChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  planChipPremium: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(4,120,87,0.24)',
  },
  planChipText: {
    color: ui.purple,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  planChipTextPremium: {
    color: '#047857',
  },
  membershipCard: {
    backgroundColor: ui.card,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: ui.border,
    ...shadows.soft,
  },
  membershipTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  membershipEyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  membershipTitle: {
    color: ui.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  membershipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(91, 79, 230, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  membershipBadgePro: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(4,120,87,0.24)',
  },
  membershipBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  membershipBadgeTextPro: {
    color: '#047857',
  },
  membershipStats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  membershipMetric: {
    flex: 1,
    minHeight: 88,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    justifyContent: 'center',
  },
  membershipMetricValue: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 8,
  },
  membershipMetricLabel: {
    color: colors.mutedForeground,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  membershipFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  membershipNote: {
    flex: 1,
    color: colors.mutedForeground,
    fontSize: 12,
    fontWeight: '700',
  },
  membershipCta: {
    minHeight: 38,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  membershipCtaText: {
    color: colors.primaryForeground,
    fontSize: 12,
    fontWeight: '900',
  },
  upgradeCard: {
    borderRadius: 28,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    shadowColor: ui.purple,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  upgradeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeCopy: {
    flex: 1,
  },
  upgradeTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  upgradeSub: {
    color: '#ffffff',
    opacity: 0.86,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  upgradeMiniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  miniCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  miniCheckText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  profileStat: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.soft,
  },
  profileStatIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileStatValue: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 10,
  },
  profileStatLabel: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  aiTrustCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F7F5FF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(91, 79, 230, 0.14)',
    padding: 16,
  },
  aiTrustIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTrustCopy: {
    flex: 1,
  },
  aiTrustTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '900',
  },
  aiTrustText: {
    color: colors.mutedForeground,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  referralCard: {
    backgroundColor: ui.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ui.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.soft,
  },
  referralIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(91, 73, 223, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralCopy: {
    flex: 1,
  },
  referralTitle: {
    color: ui.text,
    fontSize: 14,
    fontWeight: '900',
  },
  referralSub: {
    color: ui.muted,
    fontSize: 12,
    marginTop: 2,
  },
  lockBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f2eee5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    marginTop: 10,
  },
  sectionTitle: {
    color: ui.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sectionCaption: {
    color: ui.muted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  settingsCard: {
    backgroundColor: ui.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: ui.border,
    overflow: 'hidden',
    marginTop: 4,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: ui.border,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(91, 73, 223, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: {
    backgroundColor: 'rgba(229, 84, 76, 0.1)',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    color: ui.text,
    fontSize: 14,
    fontWeight: '800',
  },
  rowDetail: {
    color: ui.muted,
    fontSize: 11,
    marginTop: 2,
  },
  actionLabel: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  dangerText: {
    color: colors.danger,
  },
  footer: {
    color: ui.muted,
    textAlign: 'center',
    fontSize: 11,
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(42, 36, 29, 0.38)',
    justifyContent: 'flex-end',
  },
  modalKeyboard: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 34,
    maxHeight: '88%',
  },
  modalScrollContent: {
    gap: 14,
    paddingBottom: 4,
  },
  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  modalTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
    maxWidth: 280,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldWrap: {
    gap: 7,
  },
  fieldLabel: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '900',
  },
  fieldInput: {
    minHeight: 48,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700',
  },
  passwordInputWrap: {
    minHeight: 48,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    minHeight: 48,
    paddingLeft: 14,
    paddingRight: 8,
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700',
  },
  eyeButton: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: radius['2xl'],
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    ...shadows.soft,
  },
  disabledButton: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontSize: 15,
    fontWeight: '900',
  },
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 320,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderRadius: radius.xl,
    ...shadows.pop,
  },
  deleteHeader: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 14,
    alignItems: 'center',
  },
  deleteIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteContent: {
    marginTop: 12,
    alignItems: 'center',
  },
  deleteTitle: {
    color: '#111827',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  deleteMessage: {
    marginTop: 8,
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  deleteActions: {
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 16,
    backgroundColor: '#f9fafb',
  },
  deletePrimary: {
    minHeight: 44,
    paddingHorizontal: 16,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  deletePrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
  },
  deletePolicy: {
    minHeight: 44,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletePolicyText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  deleteCancel: {
    minHeight: 44,
    marginTop: 10,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  deleteCancelText: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
})


