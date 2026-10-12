<script setup lang="ts">
// Stand-in card while dragging: the hover ghost at the insert position, or the
// pending drop with a spinner until the API confirms the move.
defineProps<{
  post: PostListItem
  pending?: boolean
}>()
</script>

<template>
  <div v-if="pending" class="relative select-none">
    <RoadmapCard
      :post="post"
      class="opacity-50 !shadow-none animate-pulse"
    />
    <div class="absolute inset-0 flex items-center justify-center">
      <Spinner class="size-5 text-primary" />
    </div>
  </div>
  <RoadmapCard
    v-else
    :post="post"
    class="opacity-40 border-2 border-dashed border-primary/40 !shadow-none"
  />
</template>
