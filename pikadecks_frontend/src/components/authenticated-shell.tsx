import { usePathname, useRouter } from 'expo-router'
import { ReactNode, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@clerk/clerk-expo'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { useToast } from '@/components/ui/ToastProvider'
import { colors, radius, shadows } from '@/constants/theme'
import { LockedFeatureModal } from './LockedFeatureModal'
import { readJsonResponse } from '@/lib/api-debug'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

type AuthenticatedShellProps = {
  title: string
  subtitle?: string
  streak?: { value: number; state: 'ACTIVE' | 'FROZEN' | 'BROKEN' }
  rightContent?: ReactNode
  children: ReactNode
  scroll?: boolean
  scrollEnabled?: boolean
  refreshControl?: any
  hideHeader?: boolean
}

type TabDef = {
  to: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
};

const leftTabs: TabDef[] = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/decks', label: 'Decks', icon: 'layers' },
];

const rightTabs: TabDef[] = [
  { to: '/stats', label: 'Stats', icon: 'bar-chart-2' },
  { to: '/user', label: 'User', icon: 'user' },
];

export function AuthenticatedShell({
  title,
  subtitle,
  streak,
  children,
  scroll = true,
  scrollEnabled,
  refreshControl,
  hideHeader = false,
}: AuthenticatedShellProps) {
  const router = useRouter()
  const { getToken } = useAuth()
  const { isOnline } = useNetworkStatus()
  const { showToast } = useToast()
  const [uploadVisible, setUploadVisible] = useState(false)
  const [checkingActiveUpload, setCheckingActiveUpload] = useState(false)
  const [lockedModal, setLockedModal] = useState<{ visible: boolean; title: string; desc: string; icon: string }>({
    visible: false,
    title: '',
    desc: '',
    icon: 'lock',
  })

  const openLock = (title: string, desc: string, icon: string) => {
    setUploadVisible(false)
    setTimeout(() => {
      setLockedModal({ visible: true, title, desc, icon })
    }, 400) // smooth delay for modal transition
  }

  const openCreateFlow = async () => {
    if (checkingActiveUpload) return

    if (!isOnline) {
      showToast('Creating decks needs internet. You can review cached decks offline.', 'warning');
      return
    }

    setCheckingActiveUpload(true)
    try {
      const token = await getToken()
      const apiUrl = process.env.EXPO_PUBLIC_API_URL

      if (token && apiUrl) {
        const response = await fetch(`${apiUrl}/uploads/active`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const data = await readJsonResponse(response)
        const uploadId = data?.upload?.upload_id

        if (response.ok && uploadId) {
          setUploadVisible(false)
          router.push(`/upload?uploadId=${encodeURIComponent(uploadId)}` as any)
          return
        }
      }

      setUploadVisible(true)
    } catch {
      setUploadVisible(true)
    } finally {
      setCheckingActiveUpload(false)
    }
  }

  return (
    <View style={styles.root}>
      {!hideHeader && <PikaHeader title={title} subtitle={subtitle} streak={streak} />}
      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <Feather name="wifi-off" size={14} color={colors.primary} />
          <Text style={styles.offlineBannerText}>
            Offline mode. Cached reviews work; create and sync resume online.
          </Text>
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          scrollEnabled={scrollEnabled !== undefined ? scrollEnabled : true}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.contentContainer]}>
          {children}
        </View>
      )}
      
      {/* Bottom Nav triggering the premium Upload action sheet */}
      <BottomNav onPlusPress={openCreateFlow} />

      {/* ── Premium Upload Options Bottom Sheet ── */}
      <Modal
        visible={uploadVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setUploadVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setUploadVisible(false)}>
          <Pressable style={styles.sheetCard} pointerEvents="box-none">
            <View style={styles.sheetIndicator} />
            <Text style={styles.sheetTitle}>Create New Deck</Text>
            <Text style={styles.sheetSub}>Select a content source to generate flashcards</Text>

            <View style={styles.sheetList}>
              {/* Option: PDF Upload (Active) */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.sheetRow}
                onPress={() => {
                  setUploadVisible(false)
                  setTimeout(() => {
                    router.push('/upload' as any)
                  }, 150)
                }}
              >
                <View style={[styles.sheetIconBg, { backgroundColor: 'rgba(56, 189, 248, 0.08)' }]}>
                  <Feather name="file-text" size={20} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetRowTitle}>Upload PDF Document</Text>
                  <Text style={styles.sheetRowSub}>Auto-generate flashcards from slides or text</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* Option: YouTube Import */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.sheetRow}
                onPress={() => {
                  setUploadVisible(false)
                  setTimeout(() => {
                    router.push('/create-youtube' as any)
                  }, 150)
                }}
              >
                <View style={[styles.sheetIconBg, { backgroundColor: 'rgba(251, 113, 133, 0.08)' }]}>
                  <Feather name="youtube" size={20} color="#FB7185" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetRowTitle}>Create From YouTube</Text>
                  <Text style={styles.sheetRowSub}>Turn dynamic video content into key reviews</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* Option: Paste Notes (Active) */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.sheetRow}
                onPress={() => {
                  setUploadVisible(false)
                  setTimeout(() => {
                    router.push('/create-notes' as any)
                  }, 150)
                }}
              >
                <View style={[styles.sheetIconBg, { backgroundColor: 'rgba(91, 79, 230, 0.08)' }]}>
                  <Feather name="edit-3" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetRowTitle}>Paste Notes & Text</Text>
                  <Text style={styles.sheetRowSub}>Type or paste study materials manually</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sheetCloseBtn}
              onPress={() => setUploadVisible(false)}
            >
              <Text style={styles.sheetCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Locked Feature Modal container */}
      <LockedFeatureModal
        visible={lockedModal.visible}
        onClose={() => setLockedModal({ ...lockedModal, visible: false })}
        title={lockedModal.title}
        badge="Coming Soon"
        description={lockedModal.desc}
        iconName={lockedModal.icon as any}
      />
    </View>
  )
}

function PikaHeader({
  title,
  subtitle,
  streak,
}: {
  title: string;
  subtitle?: string;
  streak?: { value: number; state: 'ACTIVE' | 'FROZEN' | 'BROKEN' };
}) {
  const router = useRouter();

  const streakIcon = streak?.state === 'FROZEN'
    ? { name: 'snowflake', color: '#A5B4FC' }
    : streak?.state === 'BROKEN'
    ? { name: 'alert-circle-outline', color: colors.mutedForeground }
    : { name: 'fire', color: '#FF7A00' };

  return (
    <View style={headerStyles.wrap} testID="pika-header">
      <SafeAreaView edges={['top']}>
        <View style={headerStyles.inner}>
          <View style={{ flex: 1 }}>
            <Text style={headerStyles.title}>{title}</Text>
            {!!subtitle && <Text style={headerStyles.subtitle}>{subtitle}</Text>}
          </View>
          {streak !== undefined && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/streak')}
              style={headerStyles.streak}
              testID="streak-badge"
            >
              <MaterialCommunityIcons name={streakIcon.name as any} size={18} color={streakIcon.color} />
              <Text style={headerStyles.streakValue}>{streak.value}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function BottomNav({ onPlusPress }: { onPlusPress: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // Position the floating pill close to the bottom edge, just above the home indicator
  const bottomOffset = insets.bottom > 0 ? Math.max(6, insets.bottom - 16) : 8

  return (
    <View style={[styles.navWrap, { bottom: bottomOffset }]} pointerEvents="box-none">
      <View style={styles.navBar} testID="bottom-nav">
        {leftTabs.map((t) => (
          <TabLink
            key={t.to}
            tab={t}
            active={pathname === t.to}
            onPress={() => router.push(t.to as any)}
          />
        ))}

        {/* FAB triggers modal overlay instead of immediate redirect */}
        <TouchableOpacity
          testID="upload-fab"
          onPress={onPlusPress}
          activeOpacity={0.85}
          style={styles.fab}
        >
          <Feather name="plus" size={26} color={colors.primaryForeground} />
        </TouchableOpacity>

        {rightTabs.map((t) => (
          <TabLink
            key={t.to}
            tab={t}
            active={pathname === t.to}
            onPress={() => router.push(t.to as any)}
          />
        ))}
      </View>
    </View>
  )
}

function TabLink({ tab, active, onPress }: { tab: TabDef; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      testID={`tab-${tab.label.toLowerCase()}`}
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.tab}
    >
      <Feather
        name={tab.icon}
        size={20}
        color={active ? colors.primary : colors.mutedForeground}
      />
      <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.mutedForeground }]}>
        {tab.label.toUpperCase()}
      </Text>
    </TouchableOpacity>
  );
}

export const ui = {
  background: colors.background,
  peach: colors.brand,
  text: colors.foreground,
  muted: colors.mutedForeground,
  purple: colors.primary,
  card: colors.card,
  border: colors.border,
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 120,
  },
  navWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  navBar: {
    width: '94%',
    maxWidth: 480,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius['3xl'],
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 4, // Smaller margin to keep it close to bottom
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tab: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -32,
    borderWidth: 4,
    borderColor: colors.card,
  },
  offlineBanner: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.foreground,
    lineHeight: 16,
  },

  /* Action Sheet Overlay Styles */
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 16,
    ...shadows.pop,
  },
  sheetIndicator: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.foreground,
    textAlign: 'center',
  },
  sheetSub: {
    fontSize: 13,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 8,
  },
  sheetList: {
    gap: 12,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  sheetIconBg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRowTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.foreground,
  },
  sheetRowSub: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  sheetRowBadge: {
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sheetRowBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  sheetCloseBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius['2xl'],
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  sheetCloseBtnText: {
    fontWeight: '800',
    color: colors.foreground,
    fontSize: 15,
  },
})

const headerStyles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
  },
  title: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1,
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.xl,
    ...shadows.soft,
  },
  streakValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.foreground,
  },
});


