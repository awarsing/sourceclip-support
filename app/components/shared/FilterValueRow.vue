<script setup lang="ts">
import { resolveAttachmentUrl } from '~/utils/attachment'
import { type FilterValueOption, optionInitials } from '~/lib/filter-values'

// One checkable option in the filter value picker: a color dot for statuses,
// an avatar for people, then the label and an optional secondary line.
const props = defineProps<{
  option: FilterValueOption
  checked: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()

const image = computed(() => resolveAttachmentUrl(props.option.image))
const isPerson = computed(() => !props.option.color && props.option.sub !== undefined)
</script>

<template>
  <DropdownMenuItem
    class="cursor-pointer text-xs gap-2"
    @select.prevent="emit('toggle')"
  >
    <span
      class="w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center"
      :class="checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'"
    >
      <Icon v-if="checked" name="lucide:check" size="10" />
    </span>
    <span v-if="option.color" class="w-2 h-2 rounded-full shrink-0" :style="{ background: option.color }" />
    <Avatar v-if="isPerson" class="w-5 h-5 shrink-0">
      <img v-if="image" :src="image" :alt="option.label" class="aspect-square size-full rounded-full object-cover" referrerpolicy="no-referrer">
      <AvatarFallback v-else class="bg-accent text-accent-foreground text-[8px] font-bold">
        {{ optionInitials(option.label) }}
      </AvatarFallback>
    </Avatar>
    <span class="truncate">{{ option.label }}</span>
    <span v-if="option.sub" class="ml-auto pl-2 text-[10px] text-muted-foreground truncate">{{ option.sub }}</span>
  </DropdownMenuItem>
</template>
