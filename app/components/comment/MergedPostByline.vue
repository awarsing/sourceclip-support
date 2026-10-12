<script setup lang="ts">
// Author, time and merge badge above a merged post, with the admin unmerge menu.
defineProps<{ author: CommentItem['author']; createdAt: string; label: string; isAdmin?: boolean }>()
const emit = defineEmits<{ unmerge: [] }>()
const timeAgo = useTimeAgo()
const { authorName } = useAuthorDisplay()
</script>

<template>
  <div class="flex items-center flex-wrap gap-2 mb-3">
    <span class="font-heading font-bold text-sm">{{ authorName(author) }}</span>
    <span class="text-xs text-muted-foreground">{{ timeAgo(createdAt) }}</span>
    <span class="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md flex items-center gap-1 ml-1">
      <Icon name="lucide:git-merge" size="14" />
      {{ label }}
    </span>

    <!-- Admin unmerge menu -->
    <MergedPostUnmergeMenu v-if="isAdmin" @unmerge="emit('unmerge')" />
  </div>
</template>
