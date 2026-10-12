import { isDeepStrictEqual } from 'node:util'
import type { PoolClient } from 'pg'
import { syncConversationTask, syncRunTask } from '../inbox/tasks'
import { uuidv7 } from 'uuidv7'
import type { ChatInput } from '../../../shared/agent/content'
import { eventItem, recoverLocked, type ConversationRow } from '../inbox/service'
import { handling } from '../../../shared/inbox/state'
import { agentError, appendItem, lockConversation, transaction, type AgentRuntime, type Actor } from './runtime'

type SendInput = Extract<ChatInput, { action: 'send' }>
// Rows come from untyped pg queries.
type Row = any

// Locks the conversation, creating it for a first send.
async function lockForRun(client: PoolClient, id: string, actor: Actor, input: ChatInput): Promise<Row> {
  // Serializes concurrent first sends before there is a row to lock.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [id])
  if (input.action === 'send') {
    await client.query('INSERT INTO conversation (id,org_id,user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [
      id,
      actor.orgId,
      actor.customerId,
    ])
  }
  const conversation = await lockConversation(client, id, actor, input.action === 'send')
  if (Number(conversation.last_seq) === 0) {
    const { rowCount } = await client.query('SELECT id FROM message WHERE conversation_id=$1 LIMIT 1', [id])
    if (rowCount) agentError(404, 'conversation_not_found', 'Conversation not found')
  }
  return conversation
}

function isSameMessage(existing: Row, actor: Actor, message: SendInput['message']) {
  return (
    existing.author_type === 'customer' &&
    existing.author_user_id === actor.customerId &&
    isDeepStrictEqual(existing.content, message.content) &&
    isDeepStrictEqual(existing.context, message.context)
  )
}

// A replayed request: the same idempotency key, or a send whose message is
// already stored. Returns null for a new request.
function replay(
  input: ChatInput,
  actor: Actor,
  triggerId: string,
  duplicate: Row | undefined,
  existing: Row | undefined,
) {
  if (input.action === 'send' && existing && !isSameMessage(existing, actor, input.message)) {
    agentError(409, 'idempotency_conflict', 'Message ID belongs to different content')
  }
  if (duplicate) {
    if (duplicate.trigger_item_id !== triggerId)
      agentError(409, 'idempotency_conflict', 'Request key belongs to another message')
    return { run: duplicate, item: existing }
  }
  if (input.action === 'send' && existing) return { run: null, item: existing }
  return null
}

// Recovers an expired run and reopens a closed conversation for a new send.
async function prepareConversation(client: PoolClient, id: string, conversation: Row, input: ChatInput) {
  if (await recoverLocked(client, conversation as ConversationRow)) {
    conversation = (await client.query('SELECT * FROM conversation WHERE id=$1', [id])).rows[0]
  }
  if (input.action === 'retry' && conversation.status !== 'ai_handling')
    agentError(409, 'retry_not_allowed', 'AI retries are unavailable after handoff or closure')
  if (input.action === 'send' && conversation.status === 'closed') {
    await client.query("UPDATE conversation SET status='ai_handling',priority=0,state_due_at=NULL WHERE id=$1", [id])
    await eventItem(client, id, {
      kind: 'reopened',
      reason: 'customer_message',
      fromStatus: 'closed',
      toStatus: 'ai_handling',
    })
    conversation.status = 'ai_handling'
  }
  const { rowCount: busy } = await client.query(
    "SELECT id FROM agent_run WHERE conversation_id=$1 AND status='running'",
    [id],
  )
  if (busy) agentError(409, 'conversation_busy', 'A reply is already in progress')
  return conversation
}

async function assertRetryable(client: PoolClient, id: string, triggerId: string, item: Row | undefined) {
  const {
    rows: [last],
  } = await client.query(
    'SELECT id,author_type FROM conversation_item WHERE conversation_id=$1 ORDER BY seq DESC LIMIT 1',
    [id],
  )
  const { rowCount: completed } = await client.query(
    "SELECT id FROM agent_run WHERE trigger_item_id=$1 AND status='completed'",
    [triggerId],
  )
  if (!item || last?.id !== item.id || last.author_type !== 'customer' || completed)
    agentError(409, 'retry_not_allowed', 'Only the latest unanswered message can be retried')
}

async function appendCustomerMessage(client: PoolClient, id: string, actor: Actor, message: SendInput['message']) {
  const { rowCount: conflict } = await client.query('SELECT id FROM conversation_item WHERE id=$1', [message.id])
  if (conflict) agentError(409, 'idempotency_conflict', 'Message already exists; retry its execution instead')
  return appendItem(client, {
    id: message.id,
    conversationId: id,
    author: 'customer',
    userId: actor.customerId,
    content: message.content,
    context: message.context,
  })
}

// The customer item the run answers: the retried message, or the newly appended one.
async function triggerItem(
  client: PoolClient,
  id: string,
  actor: Actor,
  input: ChatInput,
  triggerId: string,
  existing: Row | undefined,
) {
  if (input.action === 'send') return appendCustomerMessage(client, id, actor, input.message)
  await assertRetryable(client, id, triggerId, existing)
  return existing
}

// Staff own the conversation: the message waits for them instead of the AI.
async function routeToStaff(client: PoolClient, id: string, conversation: Row, item: Row | undefined) {
  if (conversation.status !== 'open') {
    await eventItem(client, id, {
      kind: 'customer_resumed',
      reason: 'customer_message',
      fromStatus: conversation.status,
      toStatus: 'open',
    })
  }
  const {
    rows: [current],
  } = await client.query("UPDATE conversation SET status='open',state_due_at=NULL WHERE id=$1 RETURNING *", [id])
  await syncConversationTask(client, id)
  return { run: null, item, duplicate: false, conversation: current, mode: 'human' as const }
}

async function queueRun(
  client: PoolClient,
  id: string,
  triggerId: string,
  idempotencyKey: string,
  item: Row | undefined,
) {
  await client.query('UPDATE conversation SET state_due_at=NULL WHERE id=$1', [id])
  await syncConversationTask(client, id)
  const {
    rows: [run],
  } = await client.query(
    "INSERT INTO agent_run (id,conversation_id,trigger_item_id,idempotency_key,deadline_at) VALUES ($1,$2,$3,$4,now()+interval '120 seconds') RETURNING *",
    [uuidv7(), id, triggerId, idempotencyKey],
  )
  await syncRunTask(client, run.id)
  return {
    run,
    item,
    duplicate: false,
    conversation: (await client.query('SELECT * FROM conversation WHERE id=$1', [id])).rows[0],
    mode: 'ai' as const,
  }
}

export async function startRun(runtime: AgentRuntime, id: string, actor: Actor, input: ChatInput) {
  return transaction(runtime, async (client) => {
    let conversation = await lockForRun(client, id, actor, input)
    const triggerId = input.action === 'send' ? input.message.id : input.trigger_item_id
    const {
      rows: [duplicate],
    } = await client.query('SELECT * FROM agent_run WHERE conversation_id=$1 AND idempotency_key=$2', [
      id,
      input.idempotency_key,
    ])
    const {
      rows: [existing],
    } = await client.query('SELECT * FROM conversation_item WHERE conversation_id=$1 AND id=$2', [id, triggerId])
    const replayed = replay(input, actor, triggerId, duplicate, existing)
    if (replayed) return { ...replayed, duplicate: true, conversation, mode: handling(conversation.status) }

    conversation = await prepareConversation(client, id, conversation, input)
    const item = await triggerItem(client, id, actor, input, triggerId, existing)
    if (conversation.status !== 'ai_handling') return routeToStaff(client, id, conversation, item)
    return queueRun(client, id, triggerId, input.idempotency_key, item)
  }).catch((error) => {
    if (error.code === '23505') agentError(409, 'idempotency_conflict', 'Message ID or request key is already in use')
    throw error
  })
}
export async function failRun(runtime: AgentRuntime, runId: string, message: string) {
  await transaction(runtime, async (client) => {
    await client.query(
      "UPDATE agent_run SET status='failed',error=$2,finished_at=now() WHERE id=$1 AND status='running'",
      [runId, message],
    )
    await syncRunTask(client, runId)
  })
}
