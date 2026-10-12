import { createError } from 'h3'
import type { H3Event } from 'h3'
import { assertConversationImage } from '../lib/inbox/attachments'

// Staff replies (POST /api/admin/inbox/conversations/:id/replies).

interface ReplyQueryPool {
  query(text: string, values: unknown[]): Promise<{ rows: Record<string, any>[] }>
}

const MAX_REPLY_IMAGE_BYTES = 16 * 1024 * 1024

// Every attached image must be an upload under this org's prefix that still
// exists and really is an image of acceptable size.
export async function assertReplyImages(
  event: H3Event,
  pool: ReplyQueryPool,
  orgId: string,
  conversationId: string,
  parts: { type: string; storage_key?: string }[],
): Promise<void> {
  const images = parts.filter((part) => part.type === 'image')
  if (!images.length) return
  const {
    rows: [conversation],
  } = await pool.query('SELECT user_id FROM conversation WHERE id=$1 AND org_id=$2', [conversationId, orgId])
  if (!conversation) throw createError({ statusCode: 404, message: 'Conversation not found' })
  for (const part of images) {
    assertConversationImage(part.storage_key!, useRuntimeConfig(event).public.uploadPrefix, orgId)
    const file = await blobStorage.get(part.storage_key!)
    if (!file || !file.type.startsWith('image/') || file.size > MAX_REPLY_IMAGE_BYTES)
      throw createError({ statusCode: 422, message: 'Image unavailable' })
  }
}

// The queued email of a reply that was not sent right away, if one was queued.
export async function findReplyEmailState(pool: ReplyQueryPool, itemId: string) {
  const {
    rows: [task],
  } = await pool.query(
    "SELECT status,result,manual_retry,delivery_mode FROM scheduled_task WHERE kind='inbox_email' AND item_id=$1",
    [itemId],
  )
  if (!task) return null
  return {
    status: task.result ?? 'pending',
    deliveryMode: task.delivery_mode,
    canRetry: task.status === 'done' && task.result === 'failed' && !task.manual_retry,
  }
}
