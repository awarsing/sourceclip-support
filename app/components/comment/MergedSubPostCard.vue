<script setup lang="ts">
import {
  appendCommentPage,
  canLoadMergedComments,
  commentPageParams,
  startCommentLoad,
  type LoadingCommentPage,
} from './-comment-logic'

const props = defineProps<{ comment: CommentItem; isAdmin?: boolean }>()
const emit = defineEmits<{ unmerge: [postId: string] }>()

const localePath = useLocalePath()
const timeAgo = useTimeAgo()
const { authorName } = useAuthorDisplay()

const post = computed(() => props.comment.mergedPost!.post)
// Lazily loaded comments for this second-level merged post
const loaded = ref<LoadingCommentPage>()
const canLoad = computed(() => canLoadMergedComments(post.value.commentCount, loaded.value))
const hasLoaded = computed(() => !!loaded.value?.data?.length)

async function loadComments() {
  const start = startCommentLoad(loaded.value)
  if (!start) return
  loaded.value = start.state
  try {
    const res = await useApiFetch<{ data: any[]; pagination: { nextCursor: string | null } }>(
      `/api/posts/${post.value.id}/comments`,
      { params: commentPageParams(start.cursor) },
    )
    loaded.value = { ...appendCommentPage(loaded.value.data, res), loading: false }
  } catch {
    loaded.value = { ...loaded.value, loading: false }
  }
}
</script>

<template>
  <div class="flex gap-4">
    <div class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center shadow-sm relative z-10">
      <UserAvatar :author="comment.author" :size="10" />
    </div>
    <div class="flex-1 min-w-0">
      <MergedPostByline
        :author="comment.author"
        :created-at="comment.createdAt"
        :label="$t('post.merge.mergedPost')"
        :is-admin="isAdmin"
        @unmerge="emit('unmerge', post.id)"
      />
      <div class="bg-card border border-border rounded-lg p-5 shadow-sm space-y-2">
        <NuxtLink :to="localePath(`/p/${post.slug}`)" class="font-heading font-bold text-base text-foreground hover:text-primary block">
          {{ post.title }}
        </NuxtLink>
        <p v-if="post.excerpt" class="text-sm text-foreground/80 leading-relaxed">{{ post.excerpt }}</p>
      </div>

      <!-- Lazily loaded comments for this second-level post -->
      <div v-if="hasLoaded" class="mt-3 space-y-3">
        <div v-for="l2c in loaded!.data" :key="l2c.id" class="flex gap-3">
          <div class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center shadow-sm">
            <UserAvatar :author="l2c.author" :size="8" />
          </div>
          <div class="flex-1 min-w-0 bg-card border border-border rounded-lg p-3 shadow-sm">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-heading font-bold text-xs">{{ authorName(l2c.author) }}</span>
              <span class="text-[10px] text-muted-foreground">{{ timeAgo(l2c.createdAt) }}</span>
            </div>
            <p class="text-sm text-foreground/90">{{ l2c.content }}</p>
          </div>
        </div>
      </div>

      <!-- Load comments button -->
      <MergedCommentsLoadButton
        v-if="canLoad"
        class="mt-2"
        :loading="!!loaded?.loading"
        :label="hasLoaded ? $t('post.merge.loadMoreComments') : $t('post.merge.loadComments', { count: post.commentCount })"
        @load="loadComments"
      />
    </div>
  </div>
</template>
