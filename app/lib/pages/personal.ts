// Pure helpers behind the personal settings page.

export type PreferenceState = 'loading' | 'ready' | 'saving' | 'saved' | 'loadError' | 'saveError' | 'unknown'

/** A 4xx other than a timeout means the write was refused; anything else may have landed. */
export function isDefiniteFailure(status: number | undefined) {
  const code = status ?? 0
  return code >= 400 && code < 500 && code !== 408
}

/** After a lost save response, the state the read-back preferences prove. */
export function readBackState(
  result: { notifications: { staff_feedback_email_enabled: boolean } } | null,
  expected: boolean,
): PreferenceState {
  if (!result) return 'unknown'
  return result.notifications.staff_feedback_email_enabled === expected ? 'saved' : 'saveError'
}

/** The footer note: an error, a fresh save, or unsaved changes. */
export function saveStatus(state: PreferenceState, dirty: boolean) {
  if (state === 'saveError') return { key: 'settings.personal.saveError', icon: 'lucide:alert-circle' }
  if (state === 'saved') return { key: 'settings.personal.saved', icon: 'lucide:check' }
  return dirty ? { key: 'settings.unsavedChanges', icon: null } : null
}
