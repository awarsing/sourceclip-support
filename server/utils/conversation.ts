import { and, eq, gt, sql } from 'drizzle-orm'
import { conversation, organizationWidget } from '../db/schemas'
import { CONVERSATION_RETENTION_DEFAULT_DAYS } from '../../shared/constants/conversation'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Postgres throws on a non-uuid comparison.
export function isConversationId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function ownedConversation(id: string, orgId: string, userId: string) {
  return and(eq(conversation.id, id), eq(conversation.orgId, orgId), eq(conversation.userId, userId))
}

export function withinRetention(orgId: string) {
  return gt(
    conversation.lastMessageAt,
    sql`now() - make_interval(days => coalesce(
    (select ${organizationWidget.conversationRetentionDays} from ${organizationWidget}
      where ${organizationWidget.orgId} = ${orgId}),
    ${CONVERSATION_RETENTION_DEFAULT_DAYS}))`,
  )
}
