<script setup lang="ts">
defineProps<{ author: string; time: string; createdAt: string; alignEnd?: boolean }>()
</script>

<template>
  <div class="mt-1.5 flex min-w-0 items-center gap-1 px-1 text-[10px] text-muted-foreground" :class="{ 'justify-end': alignEnd }" data-message-meta>
    <span class="truncate font-semibold text-foreground dark:text-white">{{ author }}</span>
    <span aria-hidden="true">·</span>
    <time class="shrink-0" :datetime="createdAt">{{ time }}</time>
  </div>
</template>
