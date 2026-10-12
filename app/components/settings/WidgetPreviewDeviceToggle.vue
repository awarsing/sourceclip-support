<script setup lang="ts">
const device = defineModel<'desktop' | 'mobile'>({ required: true })

const DEVICES = [
  { id: 'desktop', icon: 'lucide:monitor' },
  { id: 'mobile', icon: 'lucide:smartphone' },
] as const
</script>

<template>
  <div class="inline-flex rounded-md border border-border bg-background p-0.5">
    <button
      v-for="item in DEVICES"
      :key="item.id"
      type="button"
      class="h-6 px-2 rounded flex items-center gap-1.5 text-[11px] font-semibold transition-colors"
      :class="device === item.id ? 'bg-secondary text-primary' : 'text-muted-foreground hover:text-foreground'"
      :aria-pressed="device === item.id"
      @click="device = item.id"
    >
      <Icon
        :name="item.icon"
        size="13"
      />{{ $t(`settings.widget.preview_${item.id}`) }}
    </button>
  </div>
</template>
