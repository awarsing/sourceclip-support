import { createError, getQuery, readBody } from 'h3'
import type { H3Event } from 'h3'

// The public scheduler wake (/api/internal/scheduler/schedule) takes GET or
// POST, with no query and no (or an empty object) body.
export async function assertBareSchedulerRequest(event: H3Event): Promise<void> {
  if (!['GET', 'POST'].includes(event.method)) throw createError({ statusCode: 405, message: 'Method not allowed' })
  if (Object.keys(getQuery(event)).length) throw createError({ statusCode: 400, message: 'No parameters accepted' })
  if (event.method === 'POST' && !isEmptyBody(await readBody(event))) {
    throw createError({ statusCode: 400, message: 'No parameters accepted' })
  }
}

function isEmptyBody(body: unknown): boolean {
  return body == null || (typeof body === 'object' && !Array.isArray(body) && !Object.keys(body).length)
}
