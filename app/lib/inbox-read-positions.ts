// Per-conversation read positions for the inbox badge. A position is the
// highest attention sequence the admin has seen; it only ever moves forward.
export type ReadPositions = Record<string, number>

export function readPositionsKey(orgId: string): string {
  return `feedlog:inbox:read:${orgId}`
}

function isSeq(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

// Folds saved positions (JSON from localStorage, possibly another tab's) into
// the current ones. Returns undefined when the saved value is not an object;
// throws on invalid JSON so the caller can fall back to this page's memory.
export function mergeReadPositions(current: ReadPositions | undefined, raw: string): ReadPositions | undefined {
  const saved: unknown = JSON.parse(raw)
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return undefined
  const next = { ...current }
  for (const [id, seq] of Object.entries(saved)) {
    if (isSeq(seq)) next[id] = Math.max(next[id] ?? 0, seq)
  }
  return next
}

// A sequence the server reported for a conversation: a positive safe integer.
export function isObservedSeq(seq: number): boolean {
  return isSeq(seq) && seq > 0
}

// The positions after observing `seq` on conversation `id`, or undefined when
// that changes nothing.
export function advanceReadPosition(
  current: ReadPositions | undefined,
  id: string,
  seq: number,
): ReadPositions | undefined {
  return seq > (current?.[id] ?? 0) ? { ...current, [id]: seq } : undefined
}

export function hasUnread(activity: ReadPositions | undefined, positions: ReadPositions | undefined, id: string) {
  return (activity?.[id] ?? 0) > (positions?.[id] ?? 0)
}
