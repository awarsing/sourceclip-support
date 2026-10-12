import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { changelog, changelogReaction } from '../db/schemas'
import type { ChangelogListItem } from '../../shared/types/changelog'

type ChangelogDB = ReturnType<typeof useDB>

// The published snapshot a visitor sees.
export const publishedChangelogColumns = {
  id: changelog.id,
  slug: changelog.slug,
  title: changelog.publishedTitle,
  content: changelog.publishedContent,
  categories: changelog.publishedCategories,
  cover: changelog.publishedCover,
  publishedAt: changelog.publishedAt,
}

export interface PublishedChangelogRow {
  id: string
  slug: string
  title: string | null
  content: string | null
  categories: unknown
  cover: string | null
  publishedAt: Date | null
}

export interface ChangelogReactions {
  reactionCounts: Record<string, number>
  userReactions: string[]
}

export function toChangelogListItem(row: PublishedChangelogRow, reactions: ChangelogReactions): ChangelogListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title ?? '',
    content: row.content ?? '',
    categories: (row.categories as string[]) ?? [],
    cover: row.cover ?? null,
    publishedAt: row.publishedAt!.toISOString(),
    ...reactions,
  }
}

// Reactions are only open on a published entry of this org.
export async function requirePublishedChangelog(db: ChangelogDB, orgId: string, id: string): Promise<void> {
  const [entry] = await db
    .select({ id: changelog.id })
    .from(changelog)
    .where(and(eq(changelog.id, id), eq(changelog.orgId, orgId), isNotNull(changelog.publishedAt)))
    .limit(1)
  if (!entry) {
    throw createError({ statusCode: 404, message: 'Changelog not found' })
  }
}

// Reaction counts and the viewer's own reactions for a set of entries, keyed by
// changelog id. Without a viewer there are no own reactions.
export async function findChangelogReactions(
  db: ChangelogDB,
  changelogIds: string[],
  userId: string | undefined,
): Promise<Map<string, ChangelogReactions>> {
  const byId = new Map(changelogIds.map((id) => [id, { reactionCounts: {}, userReactions: [] } as ChangelogReactions]))
  if (changelogIds.length === 0) return byId

  const counts = await db
    .select({
      changelogId: changelogReaction.changelogId,
      emoji: changelogReaction.emoji,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(changelogReaction)
    .where(inArray(changelogReaction.changelogId, changelogIds))
    .groupBy(changelogReaction.changelogId, changelogReaction.emoji)
  for (const r of counts) byId.get(r.changelogId)!.reactionCounts[r.emoji] = r.count

  if (!userId) return byId
  const own = await db
    .select({ changelogId: changelogReaction.changelogId, emoji: changelogReaction.emoji })
    .from(changelogReaction)
    .where(and(inArray(changelogReaction.changelogId, changelogIds), eq(changelogReaction.userId, userId)))
  for (const r of own) byId.get(r.changelogId)!.userReactions.push(r.emoji)
  return byId
}

// The state a reaction toggle answers with.
export async function changelogReactionState(db: ChangelogDB, changelogId: string, userId: string, reacted: boolean) {
  const reactions = (await findChangelogReactions(db, [changelogId], userId)).get(changelogId)!
  return { reacted, ...reactions }
}
