import type { H3Event } from 'h3'
import { type MigrationResult, runRuntimeMigration } from '#layers/feedlog/server/utils/runtime-migrate'
import { getUserSession } from '#layers/feedlog/server/utils/auth'
import { probeDatabaseState, setCachedState } from '../../utils/migration-state'
import { resolveConnectionString } from '../../utils/connection-string'
import { assertCloudflare } from '../../utils/preset'

// Permission model:
//   - bootstrap state (tracker absent or empty): anonymous allowed — no admin
//     exists yet to authorize, so the first caller gets to run the initial
//     migrations. Subsequent calls hit the admin gate below.
//   - pending state (tracker rows < journal entries): requires a logged-in
//     admin. Upgrade migrations should not be triggerable by anonymous
//     traffic.
//   - migrated state: no-op, but still gated by admin to avoid info leaks.

function requireConnectionString(): string {
  const connectionString = resolveConnectionString()
  if (!connectionString) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Database connection not configured',
      data: { code: 'NO_BINDING' },
    })
  }
  return connectionString
}

async function sessionUser(event: H3Event) {
  const session = await getUserSession(event).catch(() => null)
  return session?.user as { id?: string; role?: string } | undefined
}

// The id of a signed-in admin, or undefined for anyone else.
async function adminUserId(event: H3Event): Promise<string | undefined> {
  const user = await sessionUser(event)
  if (user?.role !== 'admin') return undefined
  return user.id ?? 'unknown'
}

async function migrationTriggerSource(event: H3Event, state: string): Promise<string> {
  if (state === 'bootstrap') return 'bootstrap'
  const adminId = await adminUserId(event)
  if (adminId === undefined) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      data: { code: 'REQUIRES_ADMIN', state },
    })
  }
  return `admin:${adminId}`
}

function migrationFailed(result: MigrationResult) {
  console.error(`[cf-setup] migrate failed: ${result.error}`)
  setCachedState(null)
  return createError({
    statusCode: 500,
    statusMessage: 'Migration Failed',
    data: { error: result.error, durationMs: result.durationMs },
  })
}

export default defineEventHandler(async (event) => {
  assertCloudflare()
  const connectionString = requireConnectionString()

  const preSnapshot = await probeDatabaseState(connectionString)
  const triggerSource = await migrationTriggerSource(event, preSnapshot.state)

  console.log(`[cf-setup] migrate triggered: source=${triggerSource}, pre-state=${preSnapshot.state}`)
  const result = await runRuntimeMigration(connectionString)
  if (!result.ok) throw migrationFailed(result)

  const postSnapshot = await probeDatabaseState(connectionString)
  setCachedState(postSnapshot)
  console.log(
    `[cf-setup] migrate ok: source=${triggerSource}, ${result.applied?.length ?? 0} rows in tracker, ${result.durationMs}ms`,
  )

  return {
    ok: true,
    triggerSource,
    durationMs: result.durationMs,
    state: postSnapshot,
  }
})
