import { createError, defineEventHandler, setResponseHeader } from 'h3'
import { scheduleInbox, withScheduledRuntime } from '../../../lib/inbox/scheduler'
import { checkRateLimit } from '../../../utils/rateLimit'
import { assertBareSchedulerRequest } from '../../../utils/scheduler-request'
import { delayTransport, restoreNodeTimers, schedulerContext } from '../../../lib/inbox/platform'

// Public on purpose: Vercel Cron and self-hosting share this URL, and neither sets a cron secret.
// App-initiated calls may move a wake earlier. HTTP callers only fill a missing or stalled wake.
export default defineEventHandler(async (event) => {
  await assertBareSchedulerRequest(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const internal = event.context.inboxSchedule === 'internal'
  await assertSchedulerRateLimit(internal)
  const context = schedulerContext(event)
  return withScheduledRuntime(
    context,
    undefined,
    async (runtime) => {
      const result = await scheduleInbox(runtime, delayTransport(context), internal ? 'internal' : 'external')
      if (import.meta.preset === 'node-server') await restoreNodeTimers(false)
      return result
    },
    { max: internal ? 4 : 1 },
  )
})

// Internal wakes are trusted; HTTP callers share a small, fail-closed budget.
async function assertSchedulerRateLimit(internal: boolean): Promise<void> {
  if (internal) return
  if (!(await checkRateLimit('inbox-schedule', { limit: 30, windowSeconds: 60, failClosed: true }))) {
    throw createError({ statusCode: 429, message: 'Too many scheduler requests' })
  }
}
