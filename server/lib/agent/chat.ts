import { z } from 'zod'
import { uuidv7 } from 'uuidv7'
import { toAISdkStream } from '@mastra/ai-sdk'
import { createEventStream, type H3Event } from 'h3'
import { chatInput, contentSchema, type ChatInput, type Content } from '../../../shared/agent/content'
import {
  type Actor,
  type AgentRuntime,
  agentRuntime,
  agentError,
  transaction,
  lockConversation,
  appendItem,
  publicItem,
  publicRun,
} from './runtime'
import { handoff } from '../inbox/service'
import { syncConversationTask, syncRunTask, replyCloseDelayMs } from '../inbox/tasks'
import { requestSchedule } from '../inbox/platform'
import { handling } from '../../../shared/inbox/state'
import { startRun } from './conversations'
import { prepareAgent, customerMemoryMessage } from './agent'
import { collectConversationReply } from './stream'
import { addTokenUsage, type RunTokenUsage } from '../../../shared/agent/usage'

type Execution = Awaited<ReturnType<typeof startRun>>
type Prepared = Awaited<ReturnType<typeof prepareAgent>>
type Send = (name: string, data: unknown) => Promise<void>
// Agent rows come from untyped pg queries.
type Row = any

async function parseChatRequest(event: H3Event): Promise<{ id: string; input: ChatInput }> {
  const parsedId = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!parsedId.success) agentError(404, 'conversation_not_found', 'Conversation not found')
  const parsed = chatInput.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) agentError(422, 'invalid_message', 'Message content or parameters are invalid')
  return { id: parsedId.data, input: parsed.data }
}

// Validate attachment access before committing the input or starting a run.
async function assertAttachmentsReadable(event: H3Event, actor: Actor, id: string, input: ChatInput) {
  if (input.action !== 'send') return
  await customerMemoryMessage(
    event,
    { ...input.message, conversation_id: id, seq: 0, created_at: new Date() },
    `${actor.orgId}:${id}`,
    actor.orgId,
  ).catch(() => agentError(422, 'invalid_message', 'An image could not be read'))
}

// The answer for a replayed request or a message that waits for staff.
function acceptedResponse(id: string, execution: Execution) {
  return {
    accepted: true,
    duplicate: execution.duplicate,
    mode: execution.mode,
    item: publicItem(execution.item),
    run: execution.run ? publicRun(execution.run) : null,
    conversation: {
      id,
      title: execution.conversation.title,
      lastSeq: Number(execution.conversation.last_seq),
      unread: execution.conversation.unread,
      handling: handling(execution.conversation.status),
    },
  }
}

// Aborts the model run once its agent_run row stops running (handoff, closure,
// deadline recovery) or can no longer be read.
function watchRun(runtime: AgentRuntime, runId: string, controller: AbortController) {
  let checking = false
  return setInterval(async () => {
    if (checking) return
    checking = true
    try {
      const {
        rows: [active],
      } = await runtime.pool.query("SELECT id FROM agent_run WHERE id=$1 AND status='running'", [runId])
      if (!active) controller.abort()
    } catch {
      controller.abort()
    } finally {
      checking = false
    }
  }, 1000)
}

// Streams the model's reply to the customer and returns its committed content.
async function generateReply(
  runtime: AgentRuntime,
  id: string,
  run: Row,
  replyId: string,
  prepared: Prepared,
  signal: AbortSignal,
  send: Send,
  usage: { value: RunTokenUsage | null },
): Promise<Content> {
  let failed = false
  const output = await prepared.agent.stream([prepared.input], {
    runId: run.id,
    memory: { thread: id, resource: prepared.resourceId, options: { lastMessages: prepared.historySize } },
    maxSteps: 12,
    toolCallConcurrency: 1,
    abortSignal: signal,
    onError: () => {
      failed = true
    },
    onAbort: () => {
      failed = true
    },
    onStepFinish: async (step) => {
      usage.value = addTokenUsage(usage.value, step.usage)
      // Preserve reported costs even when a later step fails; metrics must not interrupt a reply.
      await runtime.pool
        .query('UPDATE agent_run SET usage=$2 WHERE id=$1', [run.id, JSON.stringify(usage.value)])
        .catch(() => console.warn('[agent] Could not persist step token usage', { runId: run.id }))
    },
  })
  const reply = await collectConversationReply(
    toAISdkStream(output, { from: 'agent', version: 'v7', sendReasoning: false, sendSources: false }),
    replyId,
    (chunk) => {
      if (chunk.type === 'text-delta') void send('text', { runId: run.id, itemId: replyId, delta: chunk.delta })
    },
  )
  if (failed || signal.aborted) throw new Error('Model execution did not complete')
  await runtime.memory.settled()
  const text = reply.message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim()
  return contentSchema.parse({
    parts: [...(text ? [{ type: 'text', text }] : []), ...(await prepared.resultParts())],
  })
}

// Appends the reply and completes the run, if the run is still the active one.
async function commitReply(
  runtime: AgentRuntime,
  id: string,
  actor: Actor,
  run: Row,
  replyId: string,
  content: Content,
  usage: RunTokenUsage | null,
) {
  return transaction(runtime, async (client) => {
    await lockConversation(client, id, actor)
    const { rowCount } = await client.query(
      "SELECT id FROM agent_run WHERE id=$1 AND status='running' AND deadline_at>clock_timestamp()",
      [run.id],
    )
    if (!rowCount) throw new Error('Run no longer active')
    const reply = await appendItem(client, {
      id: replyId,
      conversationId: id,
      author: 'agent',
      content,
      runId: run.id,
    })
    await client.query("UPDATE conversation SET state_due_at=$2::timestamptz WHERE id=$1 AND status='ai_handling'", [
      id,
      new Date(new Date(reply.created_at).getTime() + replyCloseDelayMs()),
    ])
    await client.query("UPDATE agent_run SET status='completed',finished_at=now(),usage=$2 WHERE id=$1", [
      run.id,
      usage ? JSON.stringify(usage) : null,
    ])
    await syncConversationTask(client, id)
    await syncRunTask(client, run.id)
    return Number(reply.seq)
  })
}

// Tells the customer about the handoff, unless the conversation has already
// moved on: a closed conversation may already have reopened, and the old run
// must never announce a handoff or append a reply into that new round.
async function announceHandoff(runtime: AgentRuntime, id: string, actor: Actor, run: Row, send: Send) {
  const {
    rows: [current],
  } = await runtime.pool.query('SELECT status,last_seq FROM conversation WHERE id=$1 AND org_id=$2', [id, actor.orgId])
  if (!current || current.status === 'ai_handling') return
  await send(current.status === 'closed' ? 'closed' : 'handoff', {
    runId: run.id,
    noticeItemId: `handoff:${run.id}`,
    lastSeq: Number(current.last_seq),
    handling: handling(current.status),
  })
}

// A failed run hands the conversation to staff.
async function handOffFailedRun(
  runtime: AgentRuntime,
  id: string,
  actor: Actor,
  run: Row,
  prepared: Prepared | undefined,
  send: Send,
) {
  try {
    const feedbackResults = (await prepared?.feedbackResults().catch(() => [])) ?? []
    await handoff(runtime, id, actor.orgId, run.id, 'ai_error', true, undefined, feedbackResults)
    await announceHandoff(runtime, id, actor, run, send)
  } catch {
    await send('error', {
      runId: run.id,
      code: 'storage_unavailable',
      message: 'Connection interrupted. Please retry with the same message.',
    })
  }
}

async function runAgentReply(
  event: H3Event,
  runtime: AgentRuntime,
  actor: Actor,
  id: string,
  execution: Execution,
  send: Send,
  close: () => Promise<void>,
) {
  const { run, item } = execution
  const replyId = uuidv7()
  const controller = new AbortController()
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(Math.max(1, new Date(run.deadline_at).getTime() - Date.now())),
  ])
  const watch = watchRun(runtime, run.id, controller)
  const usage: { value: RunTokenUsage | null } = { value: null }
  let prepared: Prepared | undefined
  try {
    await send('run', { runId: run.id, itemId: replyId })
    prepared = await prepareAgent(
      event,
      actor,
      id,
      run,
      item,
      signal,
      () => {},
      () => controller.abort(),
    )
    const content = await generateReply(runtime, id, run, replyId, prepared, signal, send, usage)
    const lastSeq = await commitReply(runtime, id, actor, run, replyId, content, usage.value)
    await requestSchedule(event)
    await send('finish', { runId: run.id, itemId: replyId, lastSeq })
  } catch {
    await handOffFailedRun(runtime, id, actor, run, prepared, send)
  } finally {
    clearInterval(watch)
    await close()
  }
}

export async function streamAgentReply(event: H3Event, actor: Actor) {
  await assertGuestMay(event, actor.session, 'allowPost')
  const { id, input } = await parseChatRequest(event)
  const runtime = agentRuntime(event)
  await assertAttachmentsReadable(event, actor, id, input)
  if (!(await checkRateLimit(`widget-messages:${actor.customerId}`, { limit: 20, windowSeconds: 60 })))
    agentError(429, 'rate_limited', 'Too many messages; try again shortly')
  const execution = await startRun(runtime, id, actor, input)
  if (execution.duplicate || !execution.run) return acceptedResponse(id, execution)
  await requestSchedule(event)
  const stream = createEventStream(event)
  const send: Send = (name, data) => stream.push({ event: name, data: JSON.stringify(data) }).catch(() => {})
  const task = runAgentReply(event, runtime, actor, id, execution, send, () => stream.close())
  event.context.feedlogAgentTask = task
  event.waitUntil(task)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return stream.send()
}
