<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { acceptFailure, inviteState } from '~/lib/pages/invite'

// Accept invitation page at /invite?id=<invitationId>; see inviteState for the states it renders.
//
// `layout: false` keeps the public-board chrome (nav + Sign-in button)
// off this page — this is a standalone auth-style shell with just a logo
// + brand row up top.

definePageMeta({ layout: false, middleware: [] })

const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
const { t } = useI18n()
useHead({ title: () => t('auth.invite.joinTitle') })
// Reuse the project's global LoginModal — popping it in-page (vs navigating
// to /?login=1) keeps the user on /invite so the page can transition into
// 'match' / 'mismatch' state the moment the session refreshes.
const loginModal = useLoginModal()

const id = computed(() => {
  const raw = route.query.id
  return typeof raw === 'string' ? raw : null
})

interface InvitationView {
  id: string
  email: string
  status: string
  organizationName: string
  organizationSlug: string
  expiresAt: string | null
}

const { data: session } = useAuthSession()
const invitation = ref<InvitationView | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const accepting = ref(false)

// Public lookup endpoint (server/api/invitations/[id].get.ts). Don't use
// better-auth's organization.getInvitation — it requires the requester
// to already be signed in as the invited email, which collapses our
// anonymous/match/mismatch states into a single "Invitation unavailable"
// page and breaks the flow. Better-auth's acceptInvitation still does the
// email-binding check at the security-critical step.
onMounted(async () => {
  if (!id.value) {
    error.value = 'invalid'
    loading.value = false
    return
  }
  try {
    invitation.value = await $fetch<InvitationView>(`/api/invitations/${id.value}`)
  } catch {
    error.value = 'invalid'
  } finally {
    loading.value = false
  }
})

const state = computed(() => inviteState(loading.value, !!error.value, invitation.value, session.value?.user))

async function accept() {
  if (!invitation.value) return
  accepting.value = true
  try {
    await authClient.organization.acceptInvitation({ invitationId: invitation.value.id })
    // customSession embeds orgList in the session cookie cache (maxAge:
    // 60s). The just-acquired membership isn't visible there yet, so the
    // /dashboard admin middleware would see an empty orgList and bounce
    // the user back to /. Force a no-cache read to push the fresh
    // orgList into the cookie cache before navigating.
    await $fetch('/api/auth/get-session', { query: { disableCookieCache: 'true' } })
    await refreshNuxtData('auth-session')
    // Keep `accepting` true through the navigation — there's a microtask
    // gap between `router.push` resolving and this component unmounting
    // where the button label would otherwise flicker back to "Join …".
    await router.push(localePath('/dashboard'))
  } catch (e) {
    error.value = acceptFailure(e)
    accepting.value = false
  }
}

function startSignIn() {
  // Just open the modal — LoginModal handles OAuth via popup (window.open
  // centered, postMessage on completion) so the current /invite URL stays
  // intact and the page state updates as soon as session refreshes.
  loginModal.open()
}

async function switchAccount() {
  await authClient.signOut()
  // Same as anonymous flow once signed out.
  loginModal.open()
}
</script>

<template>
  <div class="min-h-screen bg-background font-body flex items-center justify-center px-6 py-12">
    <!-- Global login modal — this page sets layout:false so the default
         layout's <LoginModal/> mount is absent; mount our own here. -->
    <LoginModal v-model:open="loginModal.isOpen.value" />
    <div class="w-full max-w-md text-center">
      <AppLogo :size="44" class="mx-auto mb-6" />

      <template v-if="state === 'loading'">
        <p class="text-sm text-muted-foreground">{{ $t('auth.invite.loading') }}</p>
      </template>

      <template v-else-if="state === 'invalid'">
        <h1 class="font-heading text-2xl font-bold tracking-tight">{{ $t('auth.invite.unavailableTitle') }}</h1>
        <p class="text-sm text-muted-foreground mt-2 leading-relaxed">
          {{ $t('auth.invite.unavailableBody') }}
        </p>
        <NuxtLink :to="localePath('/')" class="mt-8 inline-flex h-11 px-5 rounded-lg border border-border bg-card text-sm font-semibold hover:bg-secondary transition-colors items-center gap-2">
          {{ $t('auth.invite.goToApp') }}
          <Icon name="lucide:arrow-right" size="14" />
        </NuxtLink>
      </template>

      <template v-else>
        <h1 class="font-heading text-2xl font-bold tracking-tight">{{ $t('auth.invite.joinTitle') }}</h1>
        <i18n-t keypath="auth.invite.joinTeam" tag="p" class="text-sm text-muted-foreground mt-2 leading-relaxed" scope="global">
          <template #org><span class="font-semibold text-foreground">{{ invitation!.organizationName }}</span></template>
        </i18n-t>

        <template v-if="state === 'anonymous'">
          <button
            class="mt-8 w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-heading font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
            @click="startSignIn"
          >
            {{ $t('auth.invite.signInToContinue') }}
            <Icon name="lucide:arrow-right" size="14" />
          </button>

          <p class="mt-3 text-[11px] text-muted-foreground">
            {{ $t('auth.invite.anonymousHint') }}
          </p>
        </template>

        <InviteAccountPanel
          v-else
          :user="session!.user"
          :invitation="invitation!"
          :matches="state === 'match'"
          :accepting="accepting"
          @accept="accept"
          @switch-account="switchAccount"
        />
      </template>
    </div>
  </div>
</template>
