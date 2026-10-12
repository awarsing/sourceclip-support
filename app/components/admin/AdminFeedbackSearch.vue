<script setup lang="ts">
const term = defineModel<string>({ default: '' })
const raw = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(raw, (v) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    term.value = v.trim()
  }, 300)
})
</script>

<template>
  <SearchField
    v-model="raw"
    class="admin-search"
    :placeholder="$t('dashboard.feedback.searchPlaceholder')"
    :input-label="$t('dashboard.feedback.searchAria')"
    :clear-label="$t('dashboard.feedback.clearSearch')"
    :show-clear="!!raw"
    @clear="raw = ''"
  />
</template>

<style scoped>
.admin-search {
  width: 200px;
}
@media (min-width: 1024px) {
  .admin-search { width: 240px; }
}
</style>
