// Pure state and validation for the sign-in modal and the account dialogs.

export type LoginModalState =
  | 'sign-in'
  | 'sign-in-email'
  | 'sign-up-email'
  | 'verify-email'
  | 'forgot-password'
  | 'reset-sent'

export const PASSWORD_MIN_LENGTH = 8

// Skip the chooser when email is the only available method: if OAuth is the
// only reason the chooser exists, there is nothing to route back to.
export function resolveLoginState(target: LoginModalState, hasOAuth: boolean, emailEnabled: boolean): LoginModalState {
  return target === 'sign-in' && !hasOAuth && emailEnabled ? 'sign-in-email' : target
}

interface SessionLike {
  user?: unknown
  orgList?: { orgId: string; name: string }[]
}

// The organization named in a re-authentication prompt: its display name when
// the session lists it, otherwise the slug.
export function vouchingOrgName(session: unknown, orgId: string | undefined, orgSlug: string): string {
  const list = (session as SessionLike | null)?.orgList ?? []
  return list.find((org) => org.orgId === orgId)?.name ?? orgSlug
}

// The address already on screen, offered rather than making the user recall
// it. Guests are excluded: their email is a generated placeholder.
export function sessionEmail(session: unknown): string | undefined {
  const user = (session as SessionLike | null)?.user as { email?: string; isAnonymous?: boolean } | undefined
  return user?.isAnonymous ? undefined : user?.email || undefined
}

// callbackURL is where better-auth redirects after the OAuth flow finishes.
//   - Same origin (or no authDomain): '/auth/callback', a same-origin popup
//     that posts a message to the opener and closes.
//   - Cross-domain authDomain: `{authDomain}/api/auth/post-login?return=...`
//     mints a one-time token and bounces back to this host's
//     /api/auth/handoff, which sets the session cookie and lands the popup on
//     /auth/callback.
export function oauthCallbackURL(authDomain: string, origin: string | undefined): string {
  if (!authDomain || !origin) return '/auth/callback'
  let authOrigin: string
  try {
    authOrigin = new URL(authDomain).origin
  } catch {
    return '/auth/callback'
  }
  if (authOrigin === origin) return '/auth/callback'
  return `${authDomain}/api/auth/post-login?return=${encodeURIComponent(`${origin}/auth/callback`)}`
}

// Why a sign-up form cannot be sent: incomplete forms are left to the
// browser's required-field prompts; a short password gets a message key.
export function signUpProblem(form: { name: string; email: string; password: string }): 'incomplete' | string | null {
  if (!form.name || !form.email || !form.password) return 'incomplete'
  return form.password.length < PASSWORD_MIN_LENGTH ? 'auth.errors.passwordTooShort' : null
}

export function newPasswordProblem(password: string, confirmation: string): string | null {
  if (password !== confirmation) return 'auth.errors.passwordsMismatch'
  return password.length < PASSWORD_MIN_LENGTH ? 'auth.errors.passwordTooShort' : null
}

// Copy for the password dialog: changing an existing password, or setting a
// first one for an account that only signed in through OAuth.
export function passwordDialogCopy(hasPassword: boolean | null) {
  return hasPassword
    ? {
        title: 'auth.changePassword.title',
        subtitle: 'auth.changePassword.subtitle',
        submit: 'auth.changePassword.submit',
        success: 'auth.success.passwordUpdated',
      }
    : {
        title: 'auth.changePassword.setTitle',
        subtitle: 'auth.changePassword.setSubtitle',
        submit: 'auth.changePassword.setTitle',
        success: 'auth.success.passwordSet',
      }
}

export function hasCredentialAccount(accounts: { providerId: string }[] | null | undefined): boolean {
  return accounts?.some((account) => account.providerId === 'credential') ?? false
}

// Message key for a profile name that cannot be saved, or null when it can.
export function profileNameProblem(trimmed: string, max: number): string | null {
  if (!trimmed) return 'auth.profile.nameRequired'
  return trimmed.length > max ? 'auth.profile.nameTooLong' : null
}

export function profileFromSession(session: unknown) {
  const user = (session as { user?: { name?: string | null; image?: string | null } } | null)?.user
  return { name: user?.name ?? '', image: user?.image ?? null }
}
