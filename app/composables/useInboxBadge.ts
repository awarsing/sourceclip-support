import {
  advanceReadPosition,
  hasUnread,
  isObservedSeq,
  mergeReadPositions,
  type ReadPositions,
  readPositionsKey,
} from '../lib/inbox-read-positions'

export function useInboxBadge() {
  const org = useOrgContext()
  const activity = useState<Record<string, ReadPositions>>('inbox-open-activity', () => ({}))
  const positions = useState<Record<string, ReadPositions>>('inbox-local-read-positions', () => ({}))
  const revisions = useState<Record<string, number>>('inbox-summary-revisions', () => ({}))
  // `raw` is a storage event's new value; without one, read this tab's storage.
  function loadPositions(orgId: string, raw?: string | null) {
    if (!import.meta.client) return
    try {
      const saved = raw === undefined ? localStorage.getItem(readPositionsKey(orgId)) : raw
      const next = mergeReadPositions(positions.value[orgId], saved ?? '{}')
      if (next) positions.value[orgId] = next
    } catch {
      /* Unavailable or invalid storage falls back to this page's memory. */
    }
  }
  function isUnread(id: string) {
    const orgId = org.value.orgId
    return hasUnread(activity.value[orgId], positions.value[orgId], id)
  }
  const count = computed(() => Object.keys(activity.value[org.value.orgId] ?? {}).filter(isUnread).length)
  function markRead(id: string, observedSeq: number) {
    if (!isObservedSeq(observedSeq)) return
    const orgId = org.value.orgId
    loadPositions(orgId)
    const next = advanceReadPosition(positions.value[orgId], id, observedSeq)
    if (!next) return
    positions.value[orgId] = next
    try {
      localStorage.setItem(readPositionsKey(orgId), JSON.stringify(next))
    } catch {
      /* The read position still applies until this page is refreshed. */
    }
  }
  async function refresh() {
    const orgId = org.value.orgId
    loadPositions(orgId)
    const revision = (revisions.value[orgId] ?? 0) + 1
    revisions.value[orgId] = revision
    try {
      const result = await useApiFetch<{ openConversations: { id: string; attentionSeq: number }[] }>(
        '/api/admin/inbox/summary',
      )
      if (revisions.value[orgId] === revision)
        activity.value[orgId] = Object.fromEntries(result.openConversations.map((row) => [row.id, row.attentionSeq]))
    } catch {
      /* Navigation remains available if polling fails. */
    }
  }
  function onStorage(event: StorageEvent) {
    if (event.key === readPositionsKey(org.value.orgId)) loadPositions(org.value.orgId, event.newValue)
  }
  onMounted(() => {
    loadPositions(org.value.orgId)
    window.addEventListener('storage', onStorage)
  })
  onBeforeUnmount(() => window.removeEventListener('storage', onStorage))
  return { count, refresh, isUnread, markRead }
}
