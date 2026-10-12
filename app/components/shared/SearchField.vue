<script setup lang="ts">
// Search input with a leading icon and a trailing clear button. `lg` is the
// board toolbar field, `md` the compact dashboard one. Size and placement of
// the field itself are left to the parent through its class.
const props = withDefaults(
  defineProps<{
    placeholder: string
    clearLabel: string
    inputLabel?: string
    showClear?: boolean
    size?: 'md' | 'lg'
  }>(),
  { inputLabel: undefined, showClear: true, size: 'md' },
)

const query = defineModel<string>({ required: true })
const emit = defineEmits<{ clear: []; escape: [] }>()

const input = ref<HTMLInputElement | null>(null)
const large = computed(() => props.size === 'lg')

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="fl-search" :class="{ 'fl-search--lg': large }">
    <Icon name="lucide:search" :size="large ? 18 : 15" class="fl-search__icon" />
    <input
      ref="input"
      v-model="query"
      type="text"
      :placeholder="placeholder"
      autocomplete="off"
      :aria-label="inputLabel"
      class="fl-search__input"
      @keydown.esc="emit('escape')"
    >
    <button
      v-if="showClear"
      type="button"
      :aria-label="clearLabel"
      class="fl-search__clear"
      @click="emit('clear')"
    >
      <Icon name="lucide:x" :size="large ? 16 : 14" />
    </button>
  </div>
</template>

<style scoped>
.fl-search {
  position: relative;
}
.fl-search__icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted-foreground);
  pointer-events: none;
  transition: color 0.15s ease;
}
.fl-search:focus-within .fl-search__icon {
  color: var(--primary);
}
.fl-search__input {
  height: 36px;
  width: 100%;
  padding: 0 30px 0 32px;
  font-size: 13px;
  color: var(--foreground);
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: 10px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.fl-search__input::placeholder {
  color: var(--muted-foreground);
}
.fl-search__input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 14%, transparent);
}
.fl-search__clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--muted-foreground);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.fl-search__clear:hover {
  background: var(--muted);
  color: var(--foreground);
}

.fl-search--lg .fl-search__icon {
  left: 14px;
}
.fl-search--lg .fl-search__input {
  height: 40px;
  padding: 0 38px 0 42px;
  font-size: 15px;
  background: var(--card);
  border-radius: 12px;
}
.fl-search--lg .fl-search__input:focus {
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 15%, transparent);
}
.fl-search--lg .fl-search__clear {
  right: 7px;
  width: 26px;
  height: 26px;
  border-radius: 8px;
}
.fl-search--lg .fl-search__clear:hover {
  background: var(--secondary);
}

@media (prefers-reduced-motion: reduce) {
  .fl-search__icon,
  .fl-search__input,
  .fl-search__clear {
    transition: none;
  }
}
</style>
