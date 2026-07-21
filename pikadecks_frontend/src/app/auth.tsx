import React, { useRef, useState } from 'react'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'

import { useOAuth, useSignIn, useSignUp } from '@clerk/clerk-expo'
import { router } from 'expo-router'

import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Platform,
  Image,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Linking,
  type TextInput as TextInputType,
  Animated,
  Vibration,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { pikaAssets } from '@/constants/assets'
import { colors, radius, shadows } from '@/constants/theme'
import { analyticsEvents } from '@/lib/firebase'
import { addBreadcrumb, captureException } from '@/lib/errors'

WebBrowser.maybeCompleteAuthSession()

const redirectUrl = AuthSession.makeRedirectUri({
  scheme: 'pikadecks',
  path: 'oauth-native-callback',
})

type AuthMode = 'signin' | 'signup' | 'verify' | 'reset' | 'reset_confirm'
type LoadingAction = 'google' | 'email_signin' | 'signup' | 'verify' | 'reset' | 'reset_confirm' | null

const TERMS_URL = 'https://pikadecks.app/terms'
const PRIVACY_URL = 'https://pikadecks.app/privacy'

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const maybeClerkError = error as {
      errors?: Array<{
        message?: string
        longMessage?: string
        code?: string
      }>
      message?: string
    }

    const firstError = maybeClerkError.errors?.[0]

    if (firstError?.longMessage) return firstError.longMessage
    if (firstError?.message) return firstError.message
    if (firstError?.code) return firstError.code
    if (maybeClerkError.message) return maybeClerkError.message
  }

  return 'Unknown error'
}

function getClerkErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return ''
  const maybeClerkError = error as {
    errors?: Array<{
      code?: string
    }>
    code?: string
  }
  return maybeClerkError.errors?.[0]?.code ?? maybeClerkError.code ?? ''
}

function isExpectedClerkAuthError(error: unknown) {
  const code = getClerkErrorCode(error).toLowerCase()
  const message = getErrorMessage(error).toLowerCase()
  return (
    code.includes('form_password_incorrect') ||
    code.includes('form_identifier_not_found') ||
    code.includes('form_code_incorrect') ||
    code.includes('verification_failed') ||
    code.includes('form_password_pwned') ||
    message.includes('password is incorrect') ||
    message.includes('couldn\'t find your account') ||
    message.includes('identifier is invalid') ||
    message.includes('code is incorrect') ||
    message.includes('verification code is invalid')
  )
}

function handleAuthError(error: unknown, action: string, fallbackTitle: string) {
  const message = getErrorMessage(error)
  addBreadcrumb('Handled Clerk auth validation', {
    action,
    code: getClerkErrorCode(error),
  }, 'auth')
  
  if (!isExpectedClerkAuthError(error)) {
    captureException(error, { feature: 'auth', action })
  }
  return message
}

export default function AuthPage() {
  React.useEffect(() => {
    void WebBrowser.warmUpAsync()
    return () => {
      void WebBrowser.coolDownAsync()
    }
  }, [])

  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn()
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp()
  const { startOAuthFlow: startGoogleOAuth } = useOAuth({ strategy: 'oauth_google' })

  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [validationMessage, setValidationMessageState] = useState('')
  const shakeAnim = useRef(new Animated.Value(0)).current

  const setValidationMessage = (msg: string) => {
    setValidationMessageState(msg)
    if (msg) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      Vibration.vibrate(20)
      shakeAnim.setValue(0)
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 4, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -4, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start()
    }
  }

  const passwordRef = useRef<TextInputType>(null)
  const codeRef = useRef<TextInputType>(null)
  const loading = loadingAction !== null

  const resetSensitiveFields = () => {
    setPassword('')
    setCode('')
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setValidationMessage('')
    resetSensitiveFields()
  }

  const validateEmailOrWarn = (message = 'Enter a valid email address.') => {
    if (!isValidEmail(email)) {
      setValidationMessage(message)
      return false
    }

    setValidationMessage('')
    return true
  }

  const openLegalUrl = async (url: string) => {
    try {
      await Linking.openURL(url)
    } catch (error) {
      captureException(error, { feature: 'auth', action: 'open_legal_url' })
      setValidationMessage('Unable to open link. Please try again later.')
    }
  }

  const onGoogleLogin = async () => {
    if (loading) return
    try {
      setLoadingAction('google')
      const { createdSessionId, setActive } = await startGoogleOAuth({ redirectUrl })

      if (createdSessionId) {
        await setActive?.({ session: createdSessionId })
        addBreadcrumb('Sign in completed', { method: 'google' }, 'auth')
        await analyticsEvents.signIn('google')
        router.replace('/home')
      }
    } catch (error) {
      const message = handleAuthError(error, 'google_sign_in', 'Google login failed')
      setValidationMessage(message)
    } finally {
      setLoadingAction(null)
    }
  }

  const onEmailSignIn = async () => {
    if (loading) return
    if (!signInLoaded || !signIn) return
    if (!email.trim() || !password) {
      setValidationMessage('Enter your email and password.')
      return
    }
    if (!validateEmailOrWarn()) return

    try {
      setLoadingAction('email_signin')
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      })

      if (result.status === 'complete') {
        await setSignInActive?.({ session: result.createdSessionId })
        addBreadcrumb('Sign in completed', { method: 'email' }, 'auth')
        await analyticsEvents.signIn('email')
        router.replace('/home')
        return
      }

      setValidationMessage('More steps required. Please complete the remaining sign-in step in Clerk.')
    } catch (error) {
      const message = handleAuthError(error, 'email_sign_in', 'Sign in failed')
      setValidationMessage(message)
    } finally {
      setLoadingAction(null)
    }
  }

  const onEmailSignUp = async () => {
    if (loading) return
    if (!signUpLoaded || !signUp) return
    if (!email.trim() || password.length < 8) {
      setValidationMessage('Enter a valid email and a password with at least 8 characters.')
      return
    }
    if (!validateEmailOrWarn()) return

    try {
      setLoadingAction('signup')
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
      })

      if (result.status === 'complete') {
        await setSignUpActive?.({ session: result.createdSessionId })
        addBreadcrumb('Sign up completed', { method: 'email' }, 'auth')
        await analyticsEvents.signUp('email')
        router.replace('/home')
        return
      }

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setMode('verify')
    } catch (error) {
      const message = handleAuthError(error, 'email_sign_up', 'Sign up failed')
      setValidationMessage(message)
    } finally {
      setLoadingAction(null)
    }
  }

  const onVerifyEmail = async () => {
    if (loading) return
    if (!signUpLoaded || !signUp) return
    if (!code.trim()) {
      setValidationMessage('Enter the verification code from your email.')
      return
    }

    try {
      setLoadingAction('verify')
      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      })

      if (result.status === 'complete') {
        await setSignUpActive?.({ session: result.createdSessionId })
        addBreadcrumb('Sign up completed', { method: 'email_verification' }, 'auth')
        await analyticsEvents.signUp('email')
        router.replace('/home')
        return
      }

      setValidationMessage('Verification incomplete. Please try again or request a new code.')
    } catch (error) {
      const message = handleAuthError(error, 'verify_email', 'Verification failed')
      setValidationMessage(message)
    } finally {
      setLoadingAction(null)
    }
  }

  const onRequestPasswordReset = async () => {
    if (loading) return
    if (!signInLoaded || !signIn) return
    if (!email.trim()) {
      setValidationMessage('Enter the email on your PikaDecks account.')
      return
    }
    if (!validateEmailOrWarn()) return

    try {
      setLoadingAction('reset')
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      })
      setMode('reset_confirm')
    } catch (error) {
      const message = handleAuthError(error, 'request_password_reset', 'Reset failed')
      setValidationMessage(message)
    } finally {
      setLoadingAction(null)
    }
  }

  const onConfirmPasswordReset = async () => {
    if (loading) return
    if (!signInLoaded || !signIn) return
    if (!code.trim() || password.length < 8) {
      setValidationMessage('Enter the reset code and a new password with at least 8 characters.')
      return
    }

    try {
      setLoadingAction('reset_confirm')
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password,
      })

      if (result.status === 'complete') {
        await setSignInActive?.({ session: result.createdSessionId })
        addBreadcrumb('Sign in completed', { method: 'email_password_reset' }, 'auth')
        await analyticsEvents.signIn('email_password_reset')
        router.replace('/home')
        return
      }

      setValidationMessage('Reset incomplete. Please complete the remaining sign-in step.')
    } catch (error) {
      const message = handleAuthError(error, 'confirm_password_reset', 'Reset failed')
      setValidationMessage(message)
    } finally {
      setLoadingAction(null)
    }
  }

  const title =
    mode === 'signup'
      ? 'Create your PikaDecks account'
      : mode === 'verify'
        ? 'Verify your email'
        : mode === 'reset' || mode === 'reset_confirm'
          ? 'Reset your password'
          : 'Sign in to PikaDecks'

  const subtitle =
    mode === 'signup'
      ? 'Start saving decks, uploads, and review history.'
      : mode === 'verify'
        ? 'Enter the code Clerk sent to your email.'
        : mode === 'reset' || mode === 'reset_confirm'
          ? 'Use the same email as your account.'
          : 'Save your decks and review history across all devices.'

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: 24,
        }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <Image source={pikaAssets.appIcon} style={styles.brandLogo} resizeMode="contain" />
          <Text style={styles.brandText}>PikaDecks</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {Platform.OS === 'web' ? <View nativeID="clerk-captcha" /> : null}

        <Animated.View style={[styles.formCard, { transform: [{ translateX: shakeAnim }] }, validationMessage ? { borderColor: colors.danger } : null]}>
          {mode !== 'verify' && mode !== 'reset_confirm' ? (
            <>
              <TouchableOpacity
                onPress={onGoogleLogin}
                activeOpacity={0.8}
                disabled={loading}
                style={[styles.oauthButton, loading && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
                accessibilityState={{ disabled: loading, busy: loadingAction === 'google' }}
              >
                {loadingAction === 'google' ? (
                  <ActivityIndicator color={colors.foreground} size="small" />
                ) : (
                  <Feather name="chrome" size={18} color={colors.foreground} />
                )}
                <Text style={styles.oauthText}>
                  {loadingAction === 'google' ? 'Connecting to Google...' : 'Continue with Google'}
                </Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.divider} />
              </View>
            </>
          ) : null}

          {mode !== 'verify' ? (
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              enterKeyHint={mode === 'reset' ? 'send' : 'next'}
              inputMode="email"
              keyboardType="email-address"
              onChangeText={(value) => {
                setEmail(value)
                if (validationMessage && isValidEmail(value)) setValidationMessage('')
              }}
              onSubmitEditing={() => {
                if (mode === 'reset') {
                  void onRequestPasswordReset()
                } else {
                  passwordRef.current?.focus()
                }
              }}
              placeholder="Email address"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              editable={!loading && mode !== 'reset_confirm'}
              style={[styles.input, validationMessage ? { borderColor: colors.danger } : null]}
              textContentType="emailAddress"
              accessibilityLabel="Email address"
              returnKeyType={mode === 'reset' ? 'send' : 'next'}
            />
          ) : null}

          {mode === 'signin' || mode === 'signup' || mode === 'reset_confirm' ? (
            <View style={styles.passwordWrap}>
              <TextInput
                ref={passwordRef}
                autoCapitalize="none"
                autoComplete={mode === 'signup' || mode === 'reset_confirm' ? 'new-password' : 'current-password'}
                autoCorrect={false}
                enterKeyHint={mode === 'reset_confirm' ? 'next' : 'done'}
                onSubmitEditing={() => {
                  if (mode === 'reset_confirm') {
                    codeRef.current?.focus()
                  } else if (mode === 'signin') {
                    void onEmailSignIn()
                  } else if (mode === 'signup') {
                    void onEmailSignUp()
                  }
                }}
                placeholder={mode === 'reset_confirm' ? 'New password' : 'Password'}
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={(value) => {
                  setPassword(value)
                  if (validationMessage && value.length >= 8) setValidationMessage('')
                }}
                secureTextEntry={!showPassword}
                editable={!loading}
                style={[styles.input, styles.passwordInput, validationMessage ? { borderColor: colors.danger } : null]}
                textContentType={mode === 'signup' || mode === 'reset_confirm' ? 'newPassword' : 'password'}
                accessibilityLabel={mode === 'reset_confirm' ? 'New password' : 'Password'}
                returnKeyType={mode === 'reset_confirm' ? 'next' : 'done'}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((value) => !value)}
                disabled={loading}
                style={styles.passwordToggle}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>
          ) : null}

          {mode === 'verify' || mode === 'reset_confirm' ? (
            <TextInput
              ref={codeRef}
              autoCapitalize="none"
              autoComplete="one-time-code"
              autoCorrect={false}
              enterKeyHint="done"
              keyboardType="number-pad"
              onSubmitEditing={() => {
                if (mode === 'verify') {
                  void onVerifyEmail()
                } else {
                  void onConfirmPasswordReset()
                }
              }}
              placeholder="Email code"
              placeholderTextColor={colors.mutedForeground}
              value={code}
              onChangeText={(value) => {
                setCode(value)
                if (validationMessage && value.trim()) setValidationMessage('')
              }}
              editable={!loading}
              style={[styles.input, validationMessage ? { borderColor: colors.danger } : null]}
              textContentType="oneTimeCode"
              accessibilityLabel="Email verification code"
              returnKeyType="done"
            />
          ) : null}

          {validationMessage ? (
            <Text style={styles.validationText} accessibilityLiveRegion="polite">
              {validationMessage}
            </Text>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={loading}
            style={[styles.primaryButton, loading && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'signin'
                ? 'Sign in with email'
                : mode === 'signup'
                  ? 'Create account'
                  : mode === 'verify'
                    ? 'Verify email'
                    : mode === 'reset'
                      ? 'Send reset code'
                      : 'Set new password'
            }
            accessibilityState={{ disabled: loading, busy: loading }}
            onPress={
              mode === 'signin'
                ? onEmailSignIn
                : mode === 'signup'
                  ? onEmailSignUp
                  : mode === 'verify'
                    ? onVerifyEmail
                    : mode === 'reset'
                      ? onRequestPasswordReset
                      : onConfirmPasswordReset
            }
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryText}>
                {mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : mode === 'verify'
                      ? 'Verify email'
                      : mode === 'reset'
                        ? 'Send reset code'
                        : 'Set new password'}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        {mode === 'signin' ? (
          <>
            <TouchableOpacity onPress={() => switchMode('reset')} style={styles.textButton}>
              <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>
            <Text style={styles.switchText}>
              New to PikaDecks?{' '}
              <Text style={styles.linkText} onPress={() => switchMode('signup')}>
                Create an account
              </Text>
            </Text>
          </>
        ) : mode === 'signup' ? (
          <Text style={styles.switchText}>
            Already have an account?{' '}
            <Text style={styles.linkText} onPress={() => switchMode('signin')}>
              Sign in
            </Text>
          </Text>
        ) : (
          <TouchableOpacity onPress={() => switchMode('signin')} style={styles.textButton}>
            <Text style={styles.linkText}>Back to sign in</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.legalText}>
          By continuing, you agree to our{' '}
          <Text
            style={styles.legalLink}
            onPress={() => void openLegalUrl(TERMS_URL)}
            accessibilityRole="link"
          >
            Terms & Conditions
          </Text>
          {' '}and{' '}
          <Text
            style={styles.legalLink}
            onPress={() => void openLegalUrl(PRIVACY_URL)}
            accessibilityRole="link"
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = {
  brandRow: {
    alignSelf: 'center' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 28,
  },
  brandLogo: {
    width: 44,
    height: 44,
  },
  brandText: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '900' as const,
  },
  title: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
    marginBottom: 10,
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: 15,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
    marginBottom: 28,
    lineHeight: 21,
  },
  oauthButton: {
    backgroundColor: colors.card,
    paddingVertical: 16,
    borderRadius: radius.xl,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  oauthText: {
    color: colors.foreground,
    fontWeight: '800' as const,
    fontSize: 15,
  },
  dividerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
  },
  formCard: {
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius['4xl'],
    padding: 18,
    ...shadows.soft,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.foreground,
  },
  passwordWrap: {
    position: 'relative' as const,
    justifyContent: 'center' as const,
  },
  passwordInput: {
    paddingRight: 52,
  },
  passwordToggle: {
    position: 'absolute' as const,
    right: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  validationText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 17,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 2,
    ...shadows.pop,
  },
  disabled: {
    opacity: 0.7,
  },
  primaryText: {
    color: colors.primaryForeground,
    fontSize: 15,
    fontWeight: '900' as const,
  },
  textButton: {
    alignSelf: 'center' as const,
    padding: 14,
  },
  switchText: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginTop: 16,
  },
  linkText: {
    color: colors.primary,
    fontWeight: '900' as const,
  },
  legalText: {
    color: colors.mutedForeground,
    textAlign: 'center' as const,
    fontSize: 11,
    fontWeight: '700' as const,
    lineHeight: 16,
    marginTop: 26,
  },
  legalLink: {
    color: colors.primary,
    fontWeight: '900' as const,
  },
}
