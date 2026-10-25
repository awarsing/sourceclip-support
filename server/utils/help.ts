import slugify from 'slugify'
import { customAlphabet } from 'nanoid'
import pinyin from 'pinyinlite'
import { and, eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { helpArticle, helpCollection } from '../db/schemas'
import { CJK_RANGE, HELP_SHORT_ID_ALPHABET, HELP_SHORT_ID_LENGTH } from '../../shared/constants/help'

const CJK = new RegExp(`[${CJK_RANGE}]`)

const shortId = customAlphabet(HELP_SHORT_ID_ALPHABET, HELP_SHORT_ID_LENGTH)

function generateHelpShortId(): string {
  return shortId()
}

export function generateHelpSlug(title: string): string {
  // Keep non-Chinese runs intact so product names and version numbers stay readable.
  const latin = pinyin(title, { keepUnrecognized: true })
    .map(([reading], index) => (reading === title[index] ? reading : ` ${reading} `))
    .join('')
  return slugify(latin, { lower: true, strict: true }).slice(0, 80)
}

export function cjkBigrams(text: string): string {
  const out: string[] = []
  for (let i = 0; i < text.length - 1; i++) {
    if (CJK.test(text[i]!) && CJK.test(text[i + 1]!)) out.push(text.slice(i, i + 2))
  }
  return out.join(' ')
}

export function buildHelpTsv(title: string, description: string | null, content: string): SQL {
  const body = stripMarkdown(content)
  const desc = description ?? ''
  return sql`
    setweight(to_tsvector('english', ${title}), 'A') || setweight(to_tsvector('simple', ${cjkBigrams(title)}), 'A') ||
    setweight(to_tsvector('english', ${desc}), 'B') || setweight(to_tsvector('simple', ${cjkBigrams(desc)}), 'B') ||
    setweight(to_tsvector('english', ${body}), 'C') || setweight(to_tsvector('simple', ${cjkBigrams(body)}), 'C')
  `
}

export async function withHelpShortId<T>(insert: (shortId: string) => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await insert(generateHelpShortId())
    } catch (err) {
      if ((err as { code?: string })?.code !== '23505') throw err
    }
  }
  throw createError({ statusCode: 500, message: 'Failed to generate article id' })
}

/** Columns that describe an article's collection, selected alongside article columns. */
export const helpCollectionColumns = {
  collectionId: helpCollection.id,
  collectionName: helpCollection.name,
  collectionVisible: helpCollection.visible,
}

/** Joins each help article to its collection. */
export const helpCollectionJoin = eq(helpArticle.collectionId, helpCollection.id)

/** Nests the selected collection columns under `collection`. */
export function withHelpCollection<T extends { collectionId: string; collectionName: string; collectionVisible: boolean }>(
  row: T,
) {
  const { collectionId, collectionName, collectionVisible, ...article } = row
  return { ...article, collection: { id: collectionId, name: collectionName, visible: collectionVisible } }
}

/** Loads one help article joined with its collection; `where` selects the article. */
export async function findHelpArticleRow(where: SQL | undefined) {
  const [row] = await useDB()
    .select({
      id: helpArticle.id,
      shortId: helpArticle.shortId,
      slug: helpArticle.slug,
      title: helpArticle.title,
      description: helpArticle.description,
      content: helpArticle.content,
      status: helpArticle.status,
      aiEnabled: helpArticle.aiEnabled,
      publishedAt: helpArticle.publishedAt,
      createdAt: helpArticle.createdAt,
      updatedAt: helpArticle.updatedAt,
      ...helpCollectionColumns,
    })
    .from(helpArticle)
    .innerJoin(helpCollection, helpCollectionJoin)
    .where(where)
    .limit(1)
  return row
}

export async function findHelpArticleDetail(orgId: string, id: string) {
  const row = await findHelpArticleRow(and(eq(helpArticle.id, id), eq(helpArticle.orgId, orgId)))
  return row ? withHelpCollection(row) : null
}

export async function nextHelpArticlePosition(collectionId: string): Promise<number> {
  const db = useDB()

  const [max] = await db
    .select({ position: sql<number>`cast(coalesce(max(${helpArticle.position}), -1) as int)` })
    .from(helpArticle)
    .where(eq(helpArticle.collectionId, collectionId))

  return (max?.position ?? -1) + 1
}
