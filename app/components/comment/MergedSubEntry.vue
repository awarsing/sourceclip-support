<script setup lang="ts">
import { isMergedSubPost } from './-comment-logic'

defineProps<{ comment: CommentItem; isAdmin?: boolean }>()
const emit = defineEmits<{ unmerge: [postId: string] }>()
const timeAgo = useTimeAgo()
const { authorName } = useAuthorDisplay()
</script>

<template>
  <!-- Second-level merged post card -->
  <MergedSubPostCard v-if="isMergedSubPost(comment)" :comment="comment" :is-admin="isAdmin" @unmerge="emit('unmerge', $event)" />

  <!-- Regular sub-comment -->
  <div v-else class="flex gap-4">
    <div class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center shadow-sm relative z-10">
      <UserAvatar :author="comment.author" :size="10" />
    </div>
    <div class="flex-1 min-w-0 bg-card border border-border rounded-lg p-4 shadow-sm">
      <div class="flex items-center gap-2 mb-2">
        <span class="font-heading font-bold text-sm">{{ authorName(comment.author) }}</span>
        <span class="text-xs text-muted-foreground">{{ timeAgo(comment.createdAt) }}</span>
      </div>
      <p class="text-sm text-foreground/90">{{ comment.content }}</p>
    </div>
  </div>
</template>
