<script setup lang="ts">
const props = defineProps<{
  boards: { id: string; name: string; postCount?: number | null }[]
  activeBoardId: string | null
  totalPostCount: number
}>()
const emit = defineEmits<{ select: [boardId: string | null] }>()

const entries = computed(() => [
  { id: null, name: null, count: props.totalPostCount, icon: 'lucide:layout-grid' },
  ...props.boards.map((b) => ({ id: b.id, name: b.name, count: b.postCount ?? 0, icon: 'lucide:folder' })),
])
const isActive = (id: string | null) => (id ? props.activeBoardId === id : !props.activeBoardId)
</script>

<template>
  <!-- Mobile: horizontal scrollable pills with fade edges -->
  <div class="md:hidden relative">
    <div class="font-heading text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">{{ $t('board.boards') }}</div>
    <div class="relative -mx-4">
      <nav class="board-pills flex gap-2 overflow-x-auto px-4" style="-ms-overflow-style: none; scrollbar-width: none;">
        <button
          v-for="entry in entries"
          :key="entry.id ?? 'all'"
          class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors border"
          :class="isActive(entry.id)
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground'"
          @click="emit('select', entry.id)"
        >
          {{ entry.name ?? $t('board.allFeedback') }}
          <span class="text-xs opacity-70">{{ entry.count }}</span>
        </button>
      </nav>
      <!-- Fade edges -->
      <div class="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
      <div class="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent" />
    </div>
  </div>

  <!-- Desktop: vertical list -->
  <nav class="hidden md:flex flex-col gap-2">
    <button
      v-for="entry in entries"
      :key="entry.id ?? 'all'"
      class="flex items-center justify-between px-4 py-3 rounded-lg font-medium transition-colors w-full text-left"
      :class="isActive(entry.id)
        ? 'bg-secondary text-primary'
        : 'text-muted-foreground hover:bg-card hover:text-foreground'"
      @click="emit('select', entry.id)"
    >
      <div class="flex items-center gap-3">
        <Icon :name="entry.icon" size="18" />
        <span>{{ entry.name ?? $t('board.allFeedback') }}</span>
      </div>
      <span
        class="text-xs px-2 py-0.5 rounded-full font-bold"
        :class="isActive(entry.id) ? 'bg-card text-primary shadow-sm' : 'bg-background'"
      >
        {{ entry.count }}
      </span>
    </button>
  </nav>
</template>

<style scoped>
.board-pills::-webkit-scrollbar {
  display: none;
}
</style>
