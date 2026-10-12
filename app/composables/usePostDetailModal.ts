// Opens the post detail modal from a list row, prefilled from the row so it
// renders before the full post arrives.
export function usePostDetailModal() {
  const postDetailStore = usePostDetailStore()
  const showDetail = ref(false)
  const detailSlug = ref<string | null>(null)

  function openPostDetail(item: PostListItem) {
    postDetailStore.prefill(item.slug, item)
    detailSlug.value = item.slug
    showDetail.value = true
  }

  return { showDetail, detailSlug, openPostDetail }
}
