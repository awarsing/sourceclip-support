// The board store with its boards fetched once per app load, for pages that
// render the board list straight away.
export async function useLoadedBoards() {
  const boardStore = useBoardStore()
  await callOnce(() => boardStore.fetchBoards())
  return { boardStore, ...storeToRefs(boardStore) }
}
