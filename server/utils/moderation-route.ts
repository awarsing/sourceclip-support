import { and, eq } from 'drizzle-orm'
import { createError, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { changelog } from '../db/schemas'

// A moderator (feedlog:moderate) acting on the :id record of a dashboard route.
export async function requireModeratedRoute(event: H3Event) {
  const { session, orgId } = await requireOrgPermission(event, { feedlog: ['moderate'] })
  return { session, orgId, id: getRouterParam(event, 'id')!, db: useDB() }
}

// A delete that matched nothing in this org is a 404; otherwise 204 No Content.
export function respondDeleted(event: H3Event, deleted: unknown, notFoundMessage: string): null {
  if (!deleted) {
    throw createError({ statusCode: 404, message: notFoundMessage })
  }
  setResponseStatus(event, 204)
  return null
}

// The editing fields of a changelog entry of this org.
export async function requireOrgChangelog(db: ReturnType<typeof useDB>, orgId: string, id: string) {
  const [existing] = await db
    .select({
      id: changelog.id,
      status: changelog.status,
      title: changelog.title,
      content: changelog.content,
      categories: changelog.categories,
      cover: changelog.cover,
    })
    .from(changelog)
    .where(and(eq(changelog.id, id), eq(changelog.orgId, orgId)))
    .limit(1)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Changelog not found' })
  }
  return existing
}
