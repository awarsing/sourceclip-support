<script setup lang="ts">
import type { FeedbackSort } from '~/lib/pages/posts'

// The loaded feedback page: cards on mobile, a sortable table from md up.
const props = defineProps<{
  posts: PostListItem[]
  boardMap: Map<string, string>
  sortBy: FeedbackSort
  sortOrder: 'asc' | 'desc'
}>()
defineEmits<{ open: [post: PostListItem]; sort: [column: FeedbackSort] }>()

const boardName = (post: PostListItem) => props.boardMap.get(post.boardId ?? '')
</script>

<template>
  <div class="md:hidden divide-y divide-border">
    <FeedbackPostCard v-for="fb in posts" :key="fb.id" :post="fb" :board-name="boardName(fb)" @open="$emit('open', $event)" />
  </div>

  <table class="hidden md:table w-full text-left border-collapse min-w-[900px] table-fixed">
    <thead class="sticky top-0 bg-background border-b border-border z-10">
      <tr>
        <FeedbackSortHeader class="w-[72px]" column="votes" :label="$t('dashboard.feedback.colUpvotes')" :sort-by="sortBy" :sort-order="sortOrder" @sort="$emit('sort', $event)" />
        <th class="w-1/4 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t('dashboard.feedback.colTitle') }}</th>
        <th class="w-[152px] px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t('dashboard.feedback.colBoard') }}</th>
        <th class="w-[160px] px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t('dashboard.feedback.colAuthor') }}</th>
        <FeedbackSortHeader class="w-[104px]" column="comments" :label="$t('dashboard.feedback.colComments')" :sort-by="sortBy" :sort-order="sortOrder" @sort="$emit('sort', $event)" />
        <FeedbackSortHeader class="w-[122px]" column="createdAt" :label="$t('dashboard.feedback.colCreated')" :sort-by="sortBy" :sort-order="sortOrder" @sort="$emit('sort', $event)" />
        <th class="w-[80px] px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t('dashboard.feedback.colStatus') }}</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      <FeedbackPostRow v-for="fb in posts" :key="fb.id" :post="fb" :board-name="boardName(fb)" @open="$emit('open', $event)" />
    </tbody>
  </table>
</template>
