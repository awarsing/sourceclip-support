<script setup lang="ts">
import { toast } from 'vue-sonner'

const props = defineProps<{ author: PostAuthor }>()
const { authorName } = useAuthorDisplay()
const { t } = useI18n()

async function handleCopyEmail() {
  const email = props.author?.email
  if (!email) return
  try {
    await navigator.clipboard.writeText(email)
    toast.success(t('post.detail.emailCopied'))
  } catch {
    toast.error(t('post.detail.emailCopyFailed'))
  }
}
</script>

<template>
  <div>
    <h4 class="font-heading text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">{{ $t('post.detail.author') }}</h4>
    <div class="flex items-center gap-3">
      <UserAvatar :author="author" :size="8" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold truncate">{{ authorName(author) }}</p>
        <!-- No role check here on purpose: the API only ships email to staff,
             and never for a guest — their address is a placeholder. -->
        <div v-if="author?.email" class="flex items-center gap-1">
          <a
            :href="`mailto:${author.email}`"
            class="min-w-0 text-[11px] text-muted-foreground hover:text-primary truncate transition-colors"
            :title="author.email"
          >{{ author.email }}</a>
          <button
            class="w-5 h-5 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            :title="$t('post.detail.copyEmail')"
            @click="handleCopyEmail"
          >
            <Icon name="lucide:copy" size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
