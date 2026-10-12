import type { Ref } from 'vue'

type SessionWithSso = { session?: { ssoOrgId?: string | null } } | null | undefined

// The account entries in both layouts. An SSO session may not change the global
// user record, so the entries stay visible and ask for a direct sign-in instead:
// hiding them reads as a broken page to the people most likely to arrive this way.
export function useAccountDialogs(session: Ref<unknown>) {
  const { isOpen: showLoginModal, open: openLoginModal } = useLoginModal()
  const showChangePassword = ref(false)
  const showEditProfile = ref(false)
  const isSsoSession = computed(() => !!(session.value as SessionWithSso)?.session?.ssoOrgId)

  function openUnlessSso(dialog: Ref<boolean>) {
    if (isSsoSession.value) openLoginModal(LOCAL_AUTH_REASON)
    else dialog.value = true
  }

  return {
    showLoginModal,
    showChangePassword,
    showEditProfile,
    onChangePassword: () => openUnlessSso(showChangePassword),
    onEditProfile: () => openUnlessSso(showEditProfile),
  }
}
