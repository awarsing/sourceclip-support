// Client-side checks shared by the reset-password page and the change-password dialog.

export const PASSWORD_MIN_LENGTH = 8

/** The i18n key of the first problem with a new password and its confirmation, or null. */
export function passwordProblem(newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) return 'auth.errors.passwordsMismatch'
  if (newPassword.length < PASSWORD_MIN_LENGTH) return 'auth.errors.passwordTooShort'
  return null
}
