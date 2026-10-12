<script setup lang="ts">
const emit = defineEmits<{ unmerge: [] }>()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors ml-auto">
        <Icon name="lucide:more-horizontal" size="18" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-[120px]">
      <DropdownMenuItem class="text-xs font-bold gap-2" @click="emit('unmerge')">
        <Icon name="lucide:git-branch" size="14" />
        {{ $t('post.merge.unmerge') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
