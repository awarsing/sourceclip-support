import fs from 'node:fs'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { resolveConnectionString } from './connection-string'

// Per-isolate migration state cache.
//
// Scope: module-level — survives across requests within a single CF isolate,
// resets on cold boot. That is intentional: a new isolate re-queries once,
// which is the cheapest source of truth after a deploy.

type MigrationState = 'unknown' | 'bootstrap' | 'pending' | 'migrated' | 'unreachable'

export interface StateSnapshot {
  state: MigrationState
  expected: number
  applied: number
  error?: string
}

let cache: StateSnapshot | null = null

export function setCachedState(next: StateSnapshot | null): void {
  cache = next
}

function readJournalEntries(): number {
  try {
    const raw = fs.readFileSync('/bundle/db/migrations/meta/_journal.json', 'utf-8')
    const journal = JSON.parse(raw) as { entries?: Array<unknown> }
    return Array.isArray(journal.entries) ? journal.entries.length : 0
  } catch {
    return 0
  }
}

function unreachable(expected: number, error: string): StateSnapshot {
  return { state: 'unreachable', expected, applied: 0, error }
}

function stateFor(applied: number, expected: number): MigrationState {
  if (applied === 0) return 'bootstrap'
  return applied < expected ? 'pending' : 'migrated'
}

// Rows in the drizzle tracker; 0 when the tracker table does not exist yet.
// Hyperdrive caches SELECT queries keyed on the query text; right after
// migrations run, the tracker count would be served stale and /setup
// would loop. Wrap the probe in a transaction — Hyperdrive does not
// cache queries inside transactions.
function countAppliedMigrations(db: ReturnType<typeof drizzle>): Promise<number> {
  return db.transaction(async (tx) => {
    const trackerRows = (await tx.execute(
      sql`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`,
    )) as unknown as Array<{ exists: boolean }>
    if (!trackerRows[0]?.exists) return 0

    const countRows = (await tx.execute(
      sql`SELECT COUNT(*)::int AS n FROM drizzle.__drizzle_migrations`,
    )) as unknown as Array<{ n: number }>
    return countRows[0]?.n ?? 0
  })
}

export async function probeDatabaseState(connectionString: string | undefined): Promise<StateSnapshot> {
  const expected = readJournalEntries()
  if (!connectionString) {
    return unreachable(expected, 'Database connection not configured — Hyperdrive binding missing')
  }
  const client = postgres(connectionString, { max: 1, prepare: false })
  try {
    const applied = await countAppliedMigrations(drizzle(client))
    return { state: stateFor(applied, expected), expected, applied }
  } catch (err) {
    return unreachable(expected, err instanceof Error ? `${err.name}: ${err.message}` : String(err))
  } finally {
    await client.end({ timeout: 5 })
  }
}

export async function resolveState(): Promise<StateSnapshot> {
  // Only 'migrated' is a stable terminal state — once we observe it, no
  // subsequent request in this isolate needs to re-probe. Bootstrap and
  // pending are transient: a different isolate (or this one via the
  // /api/_migrate/run endpoint) may have completed the work out from
  // under our cache, so we must re-probe on every request until we see
  // migrated ourselves.
  if (cache && cache.state === 'migrated') {
    return cache
  }
  const snapshot = await probeDatabaseState(resolveConnectionString())
  cache = snapshot
  return snapshot
}
