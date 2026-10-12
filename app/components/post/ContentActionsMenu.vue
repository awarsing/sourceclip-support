<script setup lang="ts">
// The edit / delete overflow menu shared by posts and comments.
defineProps<{ canEdit: boolean; canDelete: boolean; triggerClass: string; iconSize: string }>()
const emit = defineEmits<{ edit: []; delete: [] }>()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button class="rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors" :class="triggerClass">
        <Icon name="lucide:more-horizontal" :size="iconSize" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-[120px]">
      <DropdownMenuItem v-if="canEdit" class="text-xs font-bold gap-2" @click="emit('edit')">
        <Icon name="lucide:pencil" size="14" />
        {{ $t('common.edit') }}
      </DropdownMenuItem>
      <DropdownMenuItem v-if="canDelete" class="text-xs font-bold gap-2 text-destructive" @click="emit('delete')">
        <Icon name="lucide:trash-2" size="14" />
        {{ $t('common.delete') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
