<script setup lang="ts">
import type { MergeDirection } from './-post-logic'

defineProps<{
  title: string
  createdAt: string
  canMerge: boolean
  showMenu: boolean
  canEdit: boolean
  canDelete: boolean
}>()
const emit = defineEmits<{ merge: [direction: MergeDirection]; edit: []; delete: [] }>()
const timeAgo = useTimeAgo()
</script>

<template>
  <div class="flex items-start gap-3 mb-3">
    <div class="flex-1 min-w-0 flex items-center gap-2">
      <h2 class="font-heading text-2xl font-bold min-w-0 break-words">{{ title }}</h2>
    </div>
    <div class="flex items-center gap-2 shrink-0 pt-1">
      <span class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Icon name="lucide:clock" size="14" /> {{ timeAgo(createdAt) }}
      </span>
      <DropdownMenu v-if="canMerge">
        <DropdownMenuTrigger as-child>
          <button class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors" :title="$t('post.merge.tooltip')"><Icon name="lucide:git-merge" size="18" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-[200px]">
          <DropdownMenuItem class="text-xs font-bold gap-2" @click="emit('merge', 'bring')"><Icon name="lucide:arrow-down-left" size="14" /> {{ $t('post.merge.toThis') }}</DropdownMenuItem>
          <DropdownMenuItem class="text-xs font-bold gap-2" @click="emit('merge', 'push')"><Icon name="lucide:arrow-up-right" size="14" /> {{ $t('post.merge.thisInto') }}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu v-if="showMenu">
        <DropdownMenuTrigger as-child>
          <button class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"><Icon name="lucide:more-horizontal" size="18" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-[120px]">
          <DropdownMenuItem v-if="canEdit" class="text-xs font-bold gap-2" @click="emit('edit')"><Icon name="lucide:pencil" size="14" /> {{ $t('common.edit') }}</DropdownMenuItem>
          <DropdownMenuItem v-if="canDelete" class="text-xs font-bold gap-2 text-destructive" @click="emit('delete')"><Icon name="lucide:trash-2" size="14" /> {{ $t('common.delete') }}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>
