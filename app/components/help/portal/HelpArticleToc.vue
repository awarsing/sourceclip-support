<script setup lang="ts">
import { tocItemClass } from '~/lib/pages/help-article'

// "On this page": the article's h2 and h3 headings, the current one highlighted.
defineProps<{ items: { id: string; text: string; level: number }[]; activeId: string }>()
defineEmits<{ go: [id: string] }>()
</script>

<template>
  <aside v-show="items.length >= 2" class="sticky top-[105px] hidden lg:block">
    <p class="mb-3 flex items-center gap-2 text-[13px] font-bold leading-[18px] text-muted-foreground">
      <Icon name="lucide:list" size="15" />
      {{ $t('help.portal.onThisPage') }}
    </p>
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="block w-full border-l-2 py-[7px] text-left leading-[19px] transition-colors"
      :class="tocItemClass(item.level, item.id === activeId)"
      @click="$emit('go', item.id)"
    >
      {{ item.text }}
    </button>
  </aside>
</template>
