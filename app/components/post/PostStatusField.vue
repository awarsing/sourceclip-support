<script setup lang="ts">
import { statusCssVar } from './-post-logic'

const props = defineProps<{
  status: string
  editable: boolean
  notifyStatus: string | null
  actorName?: string
  actorImage?: string | null
}>()
const emit = defineEmits<{ change: [status: string]; send: [note: string]; dismiss: [] }>()
const dotStyle = computed(() => ({ backgroundColor: `var(${statusCssVar(props.status)})` }))

function itemClass(value: string) {
  return props.status === value ? 'font-bold' : ''
}
</script>

<template>
  <div>
    <h4 class="font-heading text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{{ $t('post.detail.status') }}</h4>
    <DropdownMenu v-if="editable">
      <DropdownMenuTrigger as-child>
        <button class="flex items-center gap-3 hover:bg-secondary/50 p-2 -ml-2 rounded-md transition-colors">
          <div class="w-3 h-3 rounded-full" :style="dotStyle" />
          <span class="font-bold text-sm">{{ $t(statusLabelKey(status)) }}</span><Icon name="lucide:chevron-down" size="14" class="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="min-w-[160px]">
        <DropdownMenuItem v-for="opt in STATUS_OPTIONS" :key="opt.value" class="text-xs font-medium gap-2" :class="itemClass(opt.value)" @click="emit('change', opt.value)">
          <span class="w-4 shrink-0 flex items-center justify-center"><Icon v-if="status === opt.value" name="lucide:check" size="12" /></span>
          <div class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: `var(${opt.cssVar})` }"></div> {{ $t(statusLabelKey(opt.value)) }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <div v-else class="flex items-center gap-3">
      <div class="w-3 h-3 rounded-full" :style="dotStyle" />
      <span class="font-bold text-sm">{{ $t(statusLabelKey(status)) }}</span>
    </div>
    <StatusNotifyPrompt
      v-if="notifyStatus"
      class="mt-2"
      :actor-name="actorName"
      :actor-image="actorImage"
      @send="emit('send', $event)"
      @dismiss="emit('dismiss')"
    />
  </div>
</template>
