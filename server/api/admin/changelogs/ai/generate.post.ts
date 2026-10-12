import OpenAI from 'openai'
import { and, eq, inArray } from 'drizzle-orm'
import { post } from '#layers/feedlog/server/db/schemas'
import { aiGenerateSchema } from '#layers/feedlog/shared/schemas/changelog'

const MAX_COMPLETION_TOKENS = 8192
const VALID_TAGS = new Set(['new', 'improved', 'fixed'])

// POST /api/admin/changelogs/ai/generate — AI changelog generation
// (feedlog:moderate — moderators only).
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgPermission(event, { feedlog: ['moderate'] })

  const body = await readValidatedBody(event, aiGenerateSchema.parse)
  const { apiKey, baseURL, model } = openAiSettings()
  const feedback = await findFeedback(orgId, body.feedbackIds)

  const style = body.style as AiStyle
  const client = new OpenAI({ apiKey, baseURL })

  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(style) },
        { role: 'user', content: buildUserPrompt(style, feedback, body.changeContent) },
      ],
      max_completion_tokens: MAX_COMPLETION_TOKENS,
    })
    return toGeneratedChangelog(resp.choices[0]?.message?.content ?? '')
  } catch (error: unknown) {
    throw toGenerationError(error)
  }
})

function openAiSettings() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 503, message: 'AI generation is not configured (OPENAI_API_KEY missing)' })
  }
  return {
    apiKey,
    baseURL: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.4',
  }
}

// The selected feedback posts of this org, if any were picked.
async function findFeedback(orgId: string, feedbackIds: string[]): Promise<{ title: string; content: string }[]> {
  if (feedbackIds.length === 0) return []
  return await useDB()
    .select({ title: post.title, content: post.content })
    .from(post)
    .where(and(eq(post.orgId, orgId), inArray(post.id, feedbackIds)))
}

// Map AI output to the API response format.
function toGeneratedChangelog(raw: string) {
  const parsed = parseAiResponse(raw)
  return {
    title: parsed.title.slice(0, 70),
    categories: parsed.suggested_tags.filter((t) => VALID_TAGS.has(t)),
    content: parsed.content_markdown,
  }
}

// H3 errors (e.g. from parseAiResponse) pass through; anything else is the
// provider failing.
function toGenerationError(error: unknown) {
  if (error && typeof error === 'object' && 'statusCode' in error) return error
  const message = error instanceof Error ? error.message : 'Unknown AI error'
  return createError({ statusCode: 502, message: `AI generation failed: ${message}` })
}
