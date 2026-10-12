<script setup lang="ts">
const props = defineProps<{
  createMode: boolean
  status: string
  slug: string | null
  saving: boolean
  publishing: boolean
  deleting: boolean
  uploading: boolean
}>()
const emit = defineEmits<{ save: []; publish: []; delete: [] }>()
const { t } = useI18n()
const localePath = useLocalePath()

const statusLabel = computed(() => t(`changelog.admin.status.${props.status}`))
const viewable = computed(() => props.status === 'published' && !!props.slug)
const saveDisabled = computed(() => props.saving || props.uploading)
const publishDisabled = computed(() => props.publishing || props.uploading)
const saveIcon = computed(() => (props.saving ? 'lucide:loader-2' : 'lucide:save'))
const publishIcon = computed(() => (props.publishing ? 'lucide:loader-2' : 'lucide:send'))
</script>

<template>
  <header class="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="localePath('/dashboard/changelog')"
        class="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Icon name="lucide:arrow-left" size="16" />
        {{ $t('changelog.editor.back') }}
      </NuxtLink>
      <div class="h-4 w-px bg-border" />
      <div v-if="!createMode" class="flex items-center gap-2 text-sm font-medium text-foreground/80">
        <Icon name="lucide:check-circle-2" size="16" class="text-success" />
        {{ statusLabel }}
      </div>
      <a
        v-if="viewable"
        :href="`/changelog/${slug}`"
        target="_blank"
        class="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
      >
        {{ $t('changelog.editor.view') }}
        <Icon name="lucide:external-link" size="14" />
      </a>
    </div>
    <div class="flex items-center gap-3">
      <button
        v-if="!createMode"
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
        :title="$t('common.delete')"
        :disabled="deleting"
        @click="emit('delete')"
      >
        <Icon name="lucide:trash-2" size="16" />
      </button>
      <button
        type="button"
        class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
        :disabled="saveDisabled"
        @click="emit('save')"
      >
        <Icon :name="saveIcon" size="14" :class="{ 'animate-spin': saving }" />
        {{ $t('common.save') }}
      </button>
      <button
        v-if="!createMode"
        type="button"
        class="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        :disabled="publishDisabled"
        @click="emit('publish')"
      >
        <Icon :name="publishIcon" size="14" :class="{ 'animate-spin': publishing }" />
        {{ $t('changelog.editor.publish') }}
      </button>
    </div>
  </header>
</template>
