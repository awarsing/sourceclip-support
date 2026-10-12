import { extractErrorCode } from '../lib/error-code'

// `reason` holds an i18n key rather than rendered text: the modal is mounted
// elsewhere and may render in a different locale than the caller.
export function useLoginModal() {
  const isOpen = useState('login-modal', () => false)
  const reason = useState<string | null>('login-modal-reason', () => null)
  return {
    isOpen,
    reason,
    open: (reasonKey?: string) => {
      reason.value = reasonKey ?? null
      isOpen.value = true
    },
  }
}

export const LOCAL_AUTH_REASON = 'auth.localAuthRequired'

// Returns whether it handled the error, so callers can skip their own toast.
export function promptLocalAuthIfRequired(payload: unknown): boolean {
  if (!import.meta.client) return false
  if (extractErrorCode(payload) !== 'LOCAL_AUTH_REQUIRED') return false
  useLoginModal().open(LOCAL_AUTH_REASON)
  return true
}
