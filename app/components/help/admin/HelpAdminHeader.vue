<script setup lang="ts">
// Title bar of the help list: totals and the New menu.
const props = defineProps<{
  stats: { collectionCount: number; articleCount: number } | null | undefined
  empty: boolean
}>()
defineEmits<{ newCollection: []; newArticle: [] }>()

const collectionCount = computed(() => props.stats?.collectionCount ?? 0)
const articleCount = computed(() => props.stats?.articleCount ?? 0)
const hasCollections = computed(() => collectionCount.value > 0)
</script>

<template>
  <header class="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
    <div class="flex items-center gap-4">
      <h2 class="font-heading text-lg font-bold">{{ $t('help.admin.title') }}</h2>
      <div class="h-4 w-px bg-border" />
      <span class="text-xs font-medium text-muted-foreground">
        <template v-if="empty">{{ $t('help.admin.statsEmpty') }}</template>
        <template v-else>
          {{ $t('help.admin.statsCollections', { n: collectionCount }, collectionCount) }}
          ·
          {{ $t('help.admin.statsArticles', { n: articleCount }, articleCount) }}
        </template>
      </span>
    </div>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
        >
          <Icon name="lucide:plus" size="16" />
          {{ $t('help.admin.new') }}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-64">
        <DropdownMenuItem class="group flex-col !items-start gap-0.5 py-2" @select="$emit('newCollection')">
          <span class="text-sm font-bold">{{ $t('help.admin.newCollection') }}</span>
          <span class="text-xs text-muted-foreground group-focus:text-accent-foreground/80">{{ $t('help.admin.newCollectionHint') }}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          class="group flex-col !items-start gap-0.5 py-2"
          :disabled="!hasCollections"
          @select="$emit('newArticle')"
        >
          <span class="text-sm font-bold">{{ $t('help.admin.newArticle') }}</span>
          <span class="text-xs text-muted-foreground group-focus:text-accent-foreground/80">
            {{ hasCollections ? $t('help.admin.newArticleHint') : $t('help.admin.newArticleDisabledHint') }}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </header>
</template>
