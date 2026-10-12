<script setup lang="ts">
// "More in <collection>": the other articles of the same collection.
defineProps<{
  collectionName: string
  siblings: { shortId: string; slug: string; title: string; description: string | null }[]
}>()
const localePath = useLocalePath()
</script>

<template>
  <div v-if="siblings.length" class="mt-6">
    <p class="mb-2.5 text-[13px] font-bold leading-[18px] text-muted-foreground">
      {{ $t('help.portal.moreIn', { name: collectionName }) }}
    </p>
    <NuxtLink
      v-for="sibling in siblings"
      :key="sibling.shortId"
      :to="localePath(`/help/${sibling.shortId}-${sibling.slug}`)"
      class="mb-2 flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card px-[18px] py-3.5 transition-colors hover:border-primary/40"
    >
      <span class="min-w-0 flex-1">
        <span class="block text-[15px] font-bold leading-[22px]">{{ sibling.title }}</span>
        <span v-if="sibling.description" class="mt-0.5 block truncate text-[13px] leading-[19px] text-muted-foreground">{{ sibling.description }}</span>
      </span>
      <Icon name="lucide:chevron-right" size="16" class="shrink-0 text-muted-foreground" />
    </NuxtLink>
  </div>
</template>
