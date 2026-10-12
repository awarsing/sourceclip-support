// State of the accept-invitation page at /invite?id=<invitationId>.
//   - invalid: invitation missing / expired / canceled / accepted
//   - anonymous: not signed in; offer to sign in or register
//   - match: signed in with matching email; one-click accept
//   - mismatch: signed in with a different email; offer Switch account
export type InviteState = 'loading' | 'invalid' | 'anonymous' | 'match' | 'mismatch'

export function inviteState(
  loading: boolean,
  failed: boolean,
  invitation: { email: string } | null,
  user: { email: string } | null | undefined,
): InviteState {
  if (loading) return 'loading'
  if (failed || !invitation) return 'invalid'
  if (!user) return 'anonymous'
  return user.email === invitation.email ? 'match' : 'mismatch'
}

/** What an accept failure shows; anything without a message reads as an invalid invitation. */
export function acceptFailure(error: unknown) {
  return (error as Error | null)?.message ?? 'invalid'
}
