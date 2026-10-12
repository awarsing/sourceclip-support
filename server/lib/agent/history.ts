import type { H3Event } from 'h3'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { pageInput } from '../../../shared/inbox/schemas'
import { handling } from '../../../shared/inbox/state'
import { readItemPage } from '../inbox/item-page'
import { type Actor, agentRuntime, agentError, transaction, publicItem, publicRun } from './runtime'

// Read-only ownership check; the scheduler owns abandoned executions.
const OWNED_SCOPE =
  'id=$1 AND org_id=$2 AND user_id=$3 AND last_seq>0 AND last_message_at>now()-make_interval(days=>$4)'

function parseItemsRequest(event: H3Event) {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) agentError(404, 'conversation_not_found', 'Conversation not found')
  const page = pageInput.safeParse(getQuery(event))
  if (!page.success) agentError(422, 'invalid_message', 'Invalid page parameters')
  return { id: id.data, page: page.data }
}

async function readItemRuns(client: PoolClient, id: string, items: Record<string, any>[]) {
  const { rows } = await client.query(
    `SELECT * FROM agent_run WHERE conversation_id=$1 AND (trigger_item_id=ANY($2::text[]) OR id=ANY($3::uuid[])) ORDER BY started_at,id`,
    [
      id,
      items.filter((i) => i.author_type === 'customer').map((i) => i.id),
      items.filter((i) => i.agent_run_id).map((i) => i.agent_run_id),
    ],
  )
  return rows
}

export async function readConversationItems(event: H3Event, actor: Actor) {
  const { id, page } = parseItemsRequest(event)
  const runtime = agentRuntime(event)
  const args = [id, actor.orgId, actor.customerId, actor.retentionDays]
  const { rowCount } = await runtime.pool.query(`SELECT id FROM conversation WHERE ${OWNED_SCOPE}`, args)
  if (!rowCount) agentError(404, 'conversation_not_found', 'Conversation not found')
  return transaction(
    runtime,
    async (client) => {
      const {
        rows: [conversation],
      } = await client.query(`SELECT id,title,last_seq,unread,status FROM conversation WHERE ${OWNED_SCOPE}`, args)
      if (!conversation) agentError(404, 'conversation_not_found', 'Conversation not found')
      const { items, ...cursors } = await readItemPage(
        client,
        id,
        page,
        { columns: 'u.name AS staff_name', on: "u.id=i.author_user_id AND i.author_type='staff'" },
        Number(conversation.last_seq),
      )
      const runs = await readItemRuns(client, id, items)
      return {
        conversation: {
          id: conversation.id,
          title: conversation.title,
          lastSeq: Number(conversation.last_seq),
          unread: conversation.unread,
          handling: handling(conversation.status),
        },
        items: items.map(publicItem).filter(Boolean),
        runs: runs.map(publicRun),
        ...cursors,
      }
    },
    true,
  )
}
