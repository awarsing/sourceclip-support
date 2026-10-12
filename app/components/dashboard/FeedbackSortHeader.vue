<script setup lang="ts">
import type { FeedbackSort } from '~/lib/pages/posts'

defineProps<{ column: FeedbackSort; label: string; sortBy: FeedbackSort; sortOrder: 'asc' | 'desc' }>()
const emit = defineEmits<{ sort: [column: FeedbackSort] }>()
</script>

<template>
  <th
    class="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-primary transition-colors"
    @click="emit('sort', column)"
  >
    <div class="flex items-center gap-1">
      {{ label }}
      <Icon v-if="sortBy === column" :name="sortOrder === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'" size="14" class="text-primary" />
    </div>
  </th>
</template>
