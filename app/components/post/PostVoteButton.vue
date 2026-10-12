<script setup lang="ts">
const props = defineProps<{ voted: boolean; count: number }>()
const emit = defineEmits<{ vote: [] }>()
const voteClass = computed(() =>
  props.voted
    ? 'bg-primary text-primary-foreground border-primary'
    : 'bg-background text-foreground border-border hover:border-primary hover:text-primary',
)
</script>

<template>
  <div class="flex flex-row md:flex-col items-center gap-3 shrink-0">
    <button
      class="upvote-btn w-14 h-[72px] rounded-md flex flex-col items-center justify-center gap-1 shadow-md border transition-transform hover:scale-105"
      :class="voteClass"
      data-fdl-action="feedback_vote"
      data-fdl-source="detail"
      @click="emit('vote')"
    >
      <Icon name="lucide:chevron-up" size="28" />
      <span class="font-heading font-bold text-lg">{{ count }}</span>
    </button>
    <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">{{ $t('post.detail.upvotes') }}</p>
  </div>
</template>

<style scoped>
.upvote-btn {
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
</style>
