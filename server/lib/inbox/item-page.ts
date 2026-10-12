import type { PoolClient } from 'pg'
import type { z } from 'zod'
import type { pageInput } from '../../../shared/inbox/schemas'

// The author columns joined onto each item: `u` is the "user" row matched by `on`.
interface AuthorJoin {
  columns: string
  on: string
}

// One page of a conversation's items in ascending seq order, with its paging
// cursors. Without afterSeq the page ends at beforeSeq (or the latest item).
export async function readItemPage(
  client: PoolClient,
  conversationId: string,
  page: z.infer<typeof pageInput>,
  author: AuthorJoin,
  lastSeq: number,
) {
  const ascending = page.afterSeq !== undefined
  const { rows } = await client.query(
    `SELECT i.*,${author.columns} FROM conversation_item i LEFT JOIN "user" u ON ${author.on} WHERE i.conversation_id=$1 AND ($2::bigint IS NULL OR i.seq${ascending ? '>' : '<'}$2) ORDER BY i.seq ${ascending ? 'ASC' : 'DESC'} LIMIT $3`,
    [conversationId, page.afterSeq ?? page.beforeSeq ?? null, page.limit + 1],
  )
  const items = rows.slice(0, page.limit)
  if (!ascending) items.reverse()
  const hasMore = rows.length > page.limit
  return {
    items,
    nextBeforeSeq: !ascending && hasMore ? Number(items[0].seq) : null,
    nextAfterSeq: items.length ? Number(items.at(-1).seq) : (page.afterSeq ?? lastSeq),
    hasMore,
  }
}
