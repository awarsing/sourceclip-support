<script setup lang="ts">
// Shown before the help center has any collection or article.
defineEmits<{ create: [] }>()
</script>

<template>
  <div class="grid flex-1 place-items-center bg-card p-10">
    <div class="max-w-[460px] text-center">
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Icon name="lucide:book-open" size="26" />
      </div>
      <p class="text-lg font-bold leading-[26px]">{{ $t('help.admin.emptyHeading') }}</p>
      <p class="mt-2 text-sm leading-[22px] text-muted-foreground">{{ $t('help.admin.emptyTitle') }}</p>
      <button
        type="button"
        class="mt-[22px] inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
        @click="$emit('create')"
      >
        {{ $t('help.admin.emptyAction') }}
      </button>
    </div>
  </div>
</template>
