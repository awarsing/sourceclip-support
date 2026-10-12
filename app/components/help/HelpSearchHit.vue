<script setup lang="ts">
import { highlightSegments } from './-help-logic'

const props = defineProps<{
  hit: {
    shortId: string
    slug: string
    title: string
    titleRanges: [number, number][]
    excerpt: string
    excerptRanges: [number, number][]
    collection: { name: string }
  }
}>()
const localePath = useLocalePath()
const titleParts = computed(() => highlightSegments(props.hit.title, props.hit.titleRanges))
const excerptParts = computed(() => highlightSegments(props.hit.excerpt, props.hit.excerptRanges))
const HIGHLIGHT = 'rounded-sm bg-primary/10 px-0.5 font-bold text-primary'
</script>

<template>
  <NuxtLink
    :to="localePath(`/help/${hit.shortId}-${hit.slug}`)"
    class="group block cursor-pointer border-b border-border px-[18px] py-3 hover:bg-background"
  >
    <div class="text-sm font-bold leading-5 group-hover:text-primary">
      <span v-for="(part, i) in titleParts" :key="i" :class="part.hit && HIGHLIGHT">{{ part.text }}</span>
    </div>
    <div class="mt-1 line-clamp-2 text-xs leading-[18px] text-muted-foreground">
      <span v-for="(part, i) in excerptParts" :key="i" :class="part.hit && HIGHLIGHT">{{ part.text }}</span>
    </div>
    <div class="mt-[7px] flex items-center gap-[5px] text-[11px] font-bold leading-[15px] text-primary">
      <Icon name="lucide:book-open" size="12" />
      {{ hit.collection.name }}
    </div>
  </NuxtLink>
</template>
