<script setup lang="ts">
const props = defineProps<{
  option: { id: AiStyle; name: string; desc: string; example: string }
  index: number
  selected: boolean
  previewOpen: boolean
}>()
const emit = defineEmits<{ select: []; togglePreview: [] }>()

const cardClass = computed(() => [
  props.selected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/50',
  props.previewOpen ? 'z-10' : '',
])
const nameClass = computed(() => (props.selected ? 'text-primary' : 'text-foreground'))
// The first row opens its example below, the second row above.
const previewClass = computed(() => (props.index < 2 ? 'top-[calc(100%+8px)]' : 'bottom-[calc(100%+8px)]'))
</script>

<template>
  <div
    class="relative flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors cursor-pointer"
    :class="cardClass"
    @click="emit('select')"
  >
    <div class="flex w-full items-center justify-between">
      <span class="text-sm font-semibold" :class="nameClass">
        {{ option.name }}
      </span>
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        :title="$t('changelog.ai.viewExample')"
        @click.stop="emit('togglePreview')"
      >
        <Icon name="lucide:info" size="14" />
      </button>
    </div>
    <span class="text-[11px] leading-snug text-muted-foreground">
      {{ option.desc }}
    </span>

    <!-- Popup Preview -->
    <div
      v-if="previewOpen"
      class="absolute left-0 z-50 w-[320px] rounded-lg border border-border bg-popover p-4 shadow-xl cursor-default"
      :class="previewClass"
      @click.stop
    >
      <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ $t('changelog.ai.examplePreview') }}</p>
      <div
        class="text-[13px] text-popover-foreground leading-relaxed"
        v-html="option.example"
      />
    </div>
  </div>
</template>
