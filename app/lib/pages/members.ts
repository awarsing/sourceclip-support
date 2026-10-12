// Pure helpers behind the members settings page.

export type MemberRole = 'owner' | 'manager' | 'contributor'

/** Split a pasted list of addresses on commas, semicolons and whitespace. */
export function parseInviteEmails(raw: string) {
  return raw
    .split(/[,;\n\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

/** Time left on an invitation as "3d", "5h" or "12m"; the expired label once it has passed. */
export function formatExpiresIn(iso: string | null, expiredLabel: string, now = Date.now()) {
  if (!iso) return ''
  const diff = new Date(iso).getTime() - now
  if (diff <= 0) return expiredLabel
  if (diff >= DAY) return `${Math.floor(diff / DAY)}d`
  if (diff >= HOUR) return `${Math.floor(diff / HOUR)}h`
  return `${Math.max(1, Math.floor(diff / MINUTE))}m`
}

/** The last owner can be neither demoted nor removed. */
export function isLastOwner(member: { role: MemberRole }, ownerCount: number) {
  return member.role === 'owner' && ownerCount <= 1
}

export function roleChangeAllowed(member: { role: MemberRole }, role: MemberRole, ownerCount: number) {
  if (role === member.role) return false
  return role === 'owner' || !isLastOwner(member, ownerCount)
}

/** Without an email provider the invite is created but not sent, and the copy says so. */
export function inviteButtonKey(inviting: boolean, emailConfigured: boolean) {
  if (inviting) return emailConfigured ? 'settings.members.sending' : 'settings.members.creating'
  return emailConfigured ? 'settings.members.sendInvites' : 'settings.members.createInvites'
}

export function inviteToast(count: number, emailConfigured: boolean) {
  return {
    title: count > 1 ? 'settings.members.invitationsCreated' : 'settings.members.invitationCreated',
    description: emailConfigured ? 'settings.members.inviteToastEmailOn' : 'settings.members.inviteToastEmailOff',
  }
}
