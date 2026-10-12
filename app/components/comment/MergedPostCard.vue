<script setup lang="ts">
import {
  appendCommentPage,
  commentPageParams,
  hasMoreMergedComments,
  mergedSubComments,
  nextMergedPage,
  type CommentPage,
} from './-comment-logic'

const props = defineProps<{
  comment: CommentItem
  isAdmin?: boolean
}>()

const emit = defineEmits<{
  unmerge: [postId: string]
}>()

const localePath = useLocalePath()
const timeAgo = useTimeAgo()
const mp = computed(() => props.comment.mergedPost)
// Extra sub-comments loaded via pagination (for first-level merged post)
const extraSubComments = ref<Record<string, CommentPage>>({})
const subComments = computed(() => mergedSubComments(mp.value, extraSubComments.value))
const hasMoreSub = computed(() => hasMoreMergedComments(mp.value, extraSubComments.value))
const loadingMore = ref(false)

async function loadMoreSubComments() {
  const page = nextMergedPage(mp.value, extraSubComments.value, loadingMore.value)
  if (page) await fetchSubComments(page)
}

async function fetchSubComments(page: { postId: string; cursor: string; previous: any[] }) {
  loadingMore.value = true
  try {
    const res = await useApiFetch<{ data: any[]; pagination: { nextCursor: string | null } }>(
      `/api/posts/${page.postId}/comments`,
      { params: commentPageParams(page.cursor) },
    )
    extraSubComments.value[page.postId] = appendCommentPage(page.previous, res)
  } finally {
    loadingMore.value = false
  }
}

const { authorName } = useAuthorDisplay()

function handleUnmerge() {
  const postId = mp.value?.post.id
  if (postId) emit('unmerge', postId)
}
</script>

<template>
  <div v-if="mp" class="relative flex flex-col gap-4">
    <div class="flex gap-4">
      <!-- Avatar -->
      <div class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center shadow-sm relative overflow-visible">
        <UserAvatar :author="comment.author" :size="10" />
      </div>

      <div class="flex-1 min-w-0">
        <!-- Header with merge badge -->
        <div class="flex items-center flex-wrap gap-2 mb-3">
          <span class="font-heading font-bold text-sm">{{ authorName(comment.author) }}</span>
          <span class="text-xs text-muted-foreground">{{ timeAgo(comment.createdAt) }}</span>
          <span class="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md flex items-center gap-1 ml-1">
            <Icon name="lucide:git-merge" size="14" />
            {{ $t('post.merge.mergedPostBy', { name: authorName(comment.author) }) }}
          </span>

          <!-- Admin unmerge menu -->
          <MergedPostUnmergeMenu v-if="isAdmin" @unmerge="handleUnmerge" />
        </div>

        <!-- Merged post card -->
        <div class="bg-card border border-border rounded-lg p-5 shadow-sm space-y-3">
          <NuxtLink :to="localePath(`/p/${mp.post.slug}`)" class="font-heading font-bold text-lg text-foreground hover:text-primary block">
            {{ mp.post.title }}
          </NuxtLink>
          <p v-if="mp.post.excerpt" class="text-sm text-foreground/80 leading-relaxed">{{ mp.post.excerpt }}</p>
        </div>
      </div>
    </div>

    <!-- Sub-post comments (indented with left border line, read-only) -->
    <div v-if="subComments.length > 0" class="ml-10 space-y-4 relative comment-thread">
      <MergedSubEntry v-for="sc in subComments" :key="sc.id" :comment="sc" :is-admin="isAdmin" @unmerge="emit('unmerge', $event)" />

      <!-- Load more sub-comments -->
      <MergedCommentsLoadButton
        v-if="hasMoreSub"
        class="ml-14"
        :loading="loadingMore"
        :label="$t('post.merge.loadMoreComments')"
        @load="loadMoreSubComments"
      />
    </div>
  </div>
</template>

<style scoped>
/* .comment-thread::before {
  content: '';
  position: absolute;
  left: 20px;
  top: 48px;
  bottom: 0;
  width: 2px;
  background-color: var(--color-border);
} */
</style>
