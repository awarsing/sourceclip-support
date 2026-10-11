#!/usr/bin/env node
// Runs a command against a throwaway local PostgreSQL cluster with pgvector.
//
//   node scripts/with-test-postgres.mjs <command> [...args]
//
// The integration tests need a real local database (feedlog_inbox_mvp) with the
// Drizzle migrations applied, and some of them create further databases. This
// starts a private cluster in a temporary directory on a free port, migrates
// it, runs the command with DATABASE_URL pointing at it, then removes it.
// PostgreSQL 17+ with pgvector must be installed. PG_BIN selects the binaries;
// otherwise the first installation with pgvector is used, from `pg_config` on
// PATH or a Homebrew postgresql@18 or postgresql@17 keg (keg-only formulas are
// not on PATH).
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const database = 'feedlog_inbox_mvp'
const [command, ...commandArgs] = process.argv.slice(2)
if (!command) {
  console.error('Usage: with-test-postgres.mjs <command> [...args]')
  process.exit(1)
}

const homebrewKegs = ['/opt/homebrew/opt', '/usr/local/opt'].flatMap((prefix) =>
  ['postgresql@18', 'postgresql@17'].map((formula) => join(prefix, formula, 'bin', 'pg_config')),
)

function pgConfig(executable, flag) {
  const result = spawnSync(executable, [flag], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : undefined
}

function hasPgvector(executable) {
  const shareDir = pgConfig(executable, '--sharedir')
  return Boolean(shareDir && existsSync(join(shareDir, 'extension', 'vector.control')))
}

function postgresBinDir() {
  if (process.env.PG_BIN) return process.env.PG_BIN
  const found = ['pg_config', ...homebrewKegs].find(hasPgvector)
  if (found) return pgConfig(found, '--bindir')
  throw new Error('PostgreSQL with pgvector was not found: install pgvector, or set PG_BIN to its PostgreSQL bin directory.')
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function runCommand(env) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { env, stdio: 'inherit' })
    child.once('error', (error) => {
      console.error(error.message)
      resolve(1)
    })
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })
}

async function main() {
  const bin = postgresBinDir()
  const tool = (name) => join(bin, name)
  if (!existsSync(tool('pg_ctl'))) throw new Error(`pg_ctl was not found in ${bin}`)
  const dir = await mkdtemp(join(tmpdir(), 'feedlog-test-pg-'))
  const dataDir = join(dir, 'data')
  const port = await freePort()
  const quiet = { stdio: ['ignore', 'ignore', 'inherit'] }
  let started = false
  try {
    execFileSync(tool('initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--no-sync', '-E', 'UTF8', '--locale=C'], quiet)
    const options = `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off -c max_connections=200`
    execFileSync(tool('pg_ctl'), ['-D', dataDir, '-l', join(dir, 'server.log'), '-o', options, '-w', 'start'], quiet)
    started = true
    const adminUrl = `postgres://postgres@127.0.0.1:${port}/postgres`
    const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
    try {
      await admin.unsafe(`CREATE DATABASE "${database}"`)
    } finally {
      await admin.end()
    }
    const url = `postgres://postgres@127.0.0.1:${port}/${database}`
    const connection = postgres(url, { max: 1, onnotice: () => {} })
    try {
      await migrate(drizzle(connection), { migrationsFolder: 'server/db/migrations' })
    } finally {
      await connection.end()
    }
    return await runCommand({ ...process.env, DATABASE_URL: url })
  } finally {
    if (started) execFileSync(tool('pg_ctl'), ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], quiet)
    await rm(dir, { recursive: true, force: true })
  }
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  },
)
