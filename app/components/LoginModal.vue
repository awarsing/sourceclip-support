<script setup lang="ts">
import { toast } from 'vue-sonner'
import {
  type LoginModalState,
  oauthCallbackURL,
  resolveLoginState,
  sessionEmail,
  signUpProblem,
  vouchingOrgName,
} from '~/lib/auth-forms'
import { authErrorMessage } from '~/lib/form-errors'

const { signIn, signUp, requestPasswordReset } = useAuth()
const { t } = useI18n()

const open = defineModel<boolean>('open', { default: false })

const state = ref<LoginModalState>('sign-in')

const loading = ref(false)

interface AuthMethods {
  google: boolean
  github: boolean
  email: boolean
  emailVerification: boolean
}
const { data: authCfg } = await useFetch<AuthMethods>('/api/auth-config', {
  key: 'auth-config',
  // If the endpoint hiccups, fall back to email-only so the modal still renders.
  default: () => ({ google: false, github: false, email: true, emailVerification: false }),
})
const hasOAuth = computed(() => !!(authCfg.value?.google || authCfg.value?.github))
const emailEnabled = computed(() => !!authCfg.value?.email)

const form = reactive({
  name: '',
  email: '',
  password: '',
})

// Set when the server refused the current session. Shown on the sign-in states
// only — deeper in a sub-flow the prompt is just noise.
const { reason } = useLoginModal()

// Named in the prompt: readers recognise the product they came from, where a
// generic mention of it means nothing.
const { data: reasonSession } = useAuthSession()
const orgCtx = useOrgContext()
const vouchingOrg = computed(() => vouchingOrgName(reasonSession.value, orgCtx.value.orgId, orgCtx.value.orgSlug))

// Retitle both sign-in states: "Sign in", right after being told they already
// are, reads as a contradiction — and the title is read first.
const signInTitle = computed(() => (reason.value ? t('auth.localAuthTitle') : t('auth.signIn.title')))
const signInEmailTitle = computed(() => (reason.value ? t('auth.localAuthTitle') : t('auth.signInEmail.title')))
const reasonText = computed(() => (reason.value ? t(reason.value, { org: vouchingOrg.value }) : ''))
const signInSubtitle = computed(() => reasonText.value || t('auth.signIn.subtitle'))

// Reset state when modal opens/closes
watch(open, (val) => {
  if (!val) {
    reason.value = null
    return
  }
  state.value = resolveLoginState('sign-in', hasOAuth.value, emailEnabled.value)
  resetForm()
  // Offer the address already on screen rather than make them recall it; still editable.
  const email = reason.value ? sessionEmail(reasonSession.value) : undefined
  if (email) form.email = email
})

function resetForm() {
  form.name = ''
  form.email = ''
  form.password = ''
}

// The email is kept when moving between steps; the name and password are not.
function switchTo(target: LoginModalState) {
  form.password = ''
  form.name = ''
  state.value = resolveLoginState(target, hasOAuth.value, emailEnabled.value)
}

function finishSignIn() {
  open.value = false
  refreshNuxtData('auth-session')
}

// --- Social OAuth (shared popup logic) ---
function currentOrigin() {
  return typeof window === 'undefined' ? undefined : window.location.origin
}

async function loginWithSocial(provider: 'google' | 'github') {
  loading.value = true

  const res = await $fetch<{ url: string }>('/api/auth/sign-in/social', {
    method: 'POST',
    body: {
      provider,
      callbackURL: oauthCallbackURL((useRuntimeConfig().public.authDomain || '') as string, currentOrigin()),
    },
  })

  const width = 500
  const height = 600
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2

  const oauthUrl = new URL(res.url)
  if (provider === 'google') {
    oauthUrl.searchParams.set('prompt', 'select_account')
  }

  const popup = window.open(
    oauthUrl.toString(),
    `${provider}-login`,
    `width=${width},height=${height},left=${left},top=${top},popup=yes`,
  )

  const timer = setInterval(() => {
    if (popup?.closed) {
      clearInterval(timer)
      loading.value = false
    }
  }, 500)

  function onMessage(event: MessageEvent) {
    if (event.data?.type === 'auth-callback') {
      clearInterval(timer)
      window.removeEventListener('message', onMessage)
      loading.value = false
      finishSignIn()
    }
  }

  window.addEventListener('message', onMessage)
}

// --- Email Sign In ---
// Signs in with the form credentials; shows the error and returns false on failure.
async function emailSignIn(codeKeys: Record<string, string>): Promise<boolean> {
  const { error } = await signIn.email({
    email: form.email,
    password: form.password,
  })
  if (error) toast.error(authErrorMessage(error, t, 'auth.errors.signInFailed', codeKeys))
  return !error
}

async function handleSignIn() {
  if (!form.email || !form.password) return
  loading.value = true
  try {
    const signedIn = await emailSignIn({
      EMAIL_NOT_VERIFIED: 'auth.errors.emailNotVerified',
      INVALID_EMAIL_OR_PASSWORD: 'auth.errors.invalidCredentials',
    })
    if (signedIn) finishSignIn()
  } finally {
    loading.value = false
  }
}

// --- Email Sign Up ---
function afterSignUp() {
  if (authCfg.value?.emailVerification) state.value = 'verify-email'
  else finishSignIn()
}

async function handleSignUp() {
  const problem = signUpProblem(form)
  if (problem) {
    if (problem !== 'incomplete') toast.error(t(problem))
    return
  }
  loading.value = true
  try {
    const { error } = await signUp.email({
      name: form.name,
      email: form.email,
      password: form.password,
    })
    if (error) toast.error(authErrorMessage(error, t, 'auth.errors.signUpFailed'))
    else afterSignUp()
  } finally {
    loading.value = false
  }
}

// --- Email Verification Polling ---
let pollingTimer: ReturnType<typeof setInterval> | null = null

async function checkSession() {
  const { data } = await useFetch('/api/auth/get-session', { key: 'auth-session-poll' })
  if (data.value) {
    stopPolling()
    finishSignIn()
  }
}

function startPolling() {
  stopPolling()
  pollingTimer = setInterval(checkSession, 3000)
  document.addEventListener('visibilitychange', onVisibilityChange)
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    checkSession()
  }
}

watch(state, (val) => {
  if (val === 'verify-email') {
    startPolling()
  } else {
    stopPolling()
  }
})

onUnmounted(() => {
  stopPolling()
})

// "I've verified" button — try to sign in with the form credentials
async function handleVerified() {
  loading.value = true
  try {
    if (await emailSignIn({ EMAIL_NOT_VERIFIED: 'auth.errors.notYetVerified' })) {
      stopPolling()
      finishSignIn()
    }
  } finally {
    loading.value = false
  }
}

// Resend verification email
const resendCooldown = ref(0)
let resendTimer: ReturnType<typeof setInterval> | null = null

function tickResendCooldown() {
  resendCooldown.value--
  if (resendCooldown.value <= 0 && resendTimer) {
    clearInterval(resendTimer)
    resendTimer = null
  }
}

async function resendVerification() {
  if (resendCooldown.value > 0) return
  try {
    await $fetch('/api/auth/send-verification-email', {
      method: 'POST',
      body: { email: form.email },
    })
    toast.success(t('auth.success.verificationResent'))
    resendCooldown.value = 60
    resendTimer = setInterval(tickResendCooldown, 1000)
  } catch {
    toast.error(t('auth.errors.resendFailed'))
  }
}

// --- Forgot Password ---
async function handleForgotPassword() {
  if (!form.email) {
    toast.error(t('auth.errors.enterEmail'))
    return
  }
  loading.value = true
  try {
    await requestPasswordReset({
      email: form.email,
      redirectTo: '/reset-password',
    })
    state.value = 'reset-sent'
  } catch {
    toast.error(t('auth.errors.sendResetFailed'))
  } finally {
    loading.value = false
  }
}

// Password visibility toggle, shared by the sign-in and sign-up steps
const showPassword = ref(false)
</script>

<template>
  <Dialog v-if="open" :open="true" @update:open="open = $event">
    <DialogContent class="sm:max-w-sm">
      <LoginChooserStep
        v-if="state === 'sign-in'"
        :title="signInTitle"
        :subtitle="signInSubtitle"
        :google="!!authCfg?.google"
        :github="!!authCfg?.github"
        :email-enabled="emailEnabled"
        :loading="loading"
        @social="loginWithSocial"
        @switch="switchTo"
      />
      <LoginEmailStep
        v-else-if="state === 'sign-in-email'"
        v-model:email="form.email"
        v-model:password="form.password"
        v-model:show-password="showPassword"
        :title="signInEmailTitle"
        :description="reasonText"
        :has-o-auth="hasOAuth"
        :loading="loading"
        @submit="handleSignIn"
        @switch="switchTo"
      />
      <LoginSignUpStep
        v-else-if="state === 'sign-up-email'"
        v-model:name="form.name"
        v-model:email="form.email"
        v-model:password="form.password"
        v-model:show-password="showPassword"
        :loading="loading"
        @submit="handleSignUp"
        @sign-in="switchTo('sign-in')"
      />
      <LoginVerifyStep
        v-else-if="state === 'verify-email'"
        :email="form.email"
        :loading="loading"
        :resend-cooldown="resendCooldown"
        @verified="handleVerified"
        @resend="resendVerification"
      />
      <LoginForgotStep
        v-else-if="state === 'forgot-password'"
        v-model:email="form.email"
        :loading="loading"
        @submit="handleForgotPassword"
        @back="switchTo('sign-in-email')"
      />
      <LoginResetSentStep v-else :email="form.email" @back="switchTo('sign-in')" />
    </DialogContent>
  </Dialog>
</template>
