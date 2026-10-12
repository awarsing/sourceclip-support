import type { H3Event } from 'h3'
import { getRequestProtocol, getRequestURL } from 'h3'

export interface InviteLinkInput {
  id: string
  organization: { slug: string }
}

/** @public Layer extension API for a consuming app's Nitro plugins. */
export type InviteLinkBuilder = (invitation: InviteLinkInput, event: H3Event) => string

const defaultBuilder: InviteLinkBuilder = (invitation, event) => {
  const url = getRequestURL(event)
  const protocol = getRequestProtocol(event)
  return `${protocol}://${url.host}/invite?id=${invitation.id}`
}

let _builder: InviteLinkBuilder = defaultBuilder

/** @public Layer extension API for a consuming app's Nitro plugins. */
export function registerInviteLinkBuilder(builder: InviteLinkBuilder): void {
  _builder = builder
}

export function buildInviteLink(invitation: InviteLinkInput, event: H3Event): string {
  return _builder(invitation, event)
}
