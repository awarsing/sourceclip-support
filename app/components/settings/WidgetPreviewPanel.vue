<script setup lang="ts">
import { resolveAttachmentUrl } from '#layers/feedlog/app/utils/attachment'

// The open widget panel inside the launcher preview: header, greeting and a
// read-only composer, branded with the organization's name and logo.
const props = defineProps<{
  org?: { name: string; logo?: string | null }
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const productName = computed(() => props.org?.name || t('widget.thisProduct'))
const orgInitial = computed(() => props.org?.name.trim().charAt(0).toUpperCase() || 'F')
</script>

<template>
  <header class="min-h-16 px-4 border-b border-border bg-card flex items-center gap-2.5 shrink-0">
    <span
      class="size-7 shrink-0 flex items-center justify-center text-primary"
      aria-hidden="true"
    >
      <Icon
        name="lucide:arrow-left"
        size="17"
      />
    </span>
    <img
      v-if="org?.logo"
      :src="resolveAttachmentUrl(org.logo)!"
      alt=""
      class="size-7 rounded-md object-cover shrink-0"
    >
    <span
      v-else
      class="size-7 rounded-md shrink-0 grid place-items-center bg-primary text-primary-foreground font-heading font-bold text-[13px]"
    >{{ orgInitial }}</span>
    <p class="flex-1 min-w-0 font-heading font-semibold text-[15.5px] truncate">
      {{ $t('widget.agentTitle', { product: productName }) }}
    </p>
    <button
      type="button"
      class="size-6.5 rounded-full bg-secondary hover:opacity-80 transition-opacity flex items-center justify-center text-primary shrink-0"
      :aria-label="$t('settings.widget.previewClosePanel')"
      @click="emit('close')"
    >
      <Icon
        name="lucide:x"
        size="13"
      />
    </button>
  </header>
  <div class="min-h-0 flex-1 overflow-y-auto bg-background p-3.5 [overflow-wrap:anywhere]">
    <p class="max-w-[88%] rounded-lg border border-border bg-card px-3 py-2.5 text-[13.5px]">
      {{ $t('widget.greeting', { product: productName }) }}
    </p>
  </div>
  <div class="px-3 py-2.5 bg-card shrink-0">
    <div class="rounded-md border border-border bg-card">
      <textarea
        readonly
        tabindex="-1"
        rows="1"
        :placeholder="$t('widget.placeholder')"
        :aria-label="$t('widget.placeholder')"
        class="w-full min-h-12 max-h-[120px] px-3 py-2 bg-transparent text-[13.5px] leading-normal resize-none focus:outline-none"
      />
      <div class="flex items-center justify-between px-1.5 py-1">
        <button
          type="button"
          disabled
          class="h-6.5 w-7 rounded-md flex items-center justify-center text-muted-foreground disabled:cursor-default"
          :aria-label="$t('widget.attachImage')"
        >
          <Icon
            name="lucide:image"
            size="15"
          />
        </button>
        <button
          type="button"
          disabled
          class="px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground text-[12.5px] font-heading font-semibold disabled:opacity-40 disabled:cursor-default"
        >
          {{ $t('widget.send') }}
        </button>
      </div>
    </div>
  </div>
  <p class="pt-1.5 pb-1.5 bg-card text-center text-[10.5px] text-muted-foreground shrink-0">
    {{ $t('board.poweredBy') }}FeedLog
  </p>
</template>
