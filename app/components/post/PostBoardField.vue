<script setup lang="ts">
const props = defineProps<{
  boardId: string | null
  boardName: string | null
  boards: { id: string; name: string }[]
  editable: boolean
}>()
const emit = defineEmits<{ change: [boardId: string | null] }>()
const { t } = useI18n()
const label = computed(() => props.boardName ?? t('post.detail.none'))

function itemClass(boardId: string | null) {
  return props.boardId === boardId ? 'font-bold' : ''
}
</script>

<template>
  <div>
    <h4 class="font-heading text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{{ $t('post.detail.board') }}</h4>
    <DropdownMenu v-if="editable">
      <DropdownMenuTrigger as-child>
        <button class="flex items-center gap-3 hover:bg-secondary/50 p-2 -ml-2 rounded-md transition-colors">
          <Icon name="lucide:folder" size="16" class="text-primary shrink-0" /><span class="font-bold text-sm">{{ label }}</span><Icon name="lucide:chevron-down" size="14" class="text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="min-w-[200px]">
        <DropdownMenuItem class="text-xs font-medium gap-2" :class="itemClass(null)" @click="emit('change', null)">
          <span class="w-4 shrink-0 flex items-center justify-center"><Icon v-if="!boardId" name="lucide:check" size="12" /></span> {{ $t('post.detail.none') }}
        </DropdownMenuItem>
        <DropdownMenuItem v-for="board in boards" :key="board.id" class="text-xs font-medium gap-2" :class="itemClass(board.id)" @click="emit('change', board.id)">
          <span class="w-4 shrink-0 flex items-center justify-center"><Icon v-if="boardId === board.id" name="lucide:check" size="12" /></span> {{ board.name }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <div v-else class="flex items-center gap-3 p-2 -ml-2"><Icon name="lucide:folder" size="16" class="text-primary shrink-0" /><span class="font-bold text-sm">{{ label }}</span></div>
  </div>
</template>
