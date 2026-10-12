<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { SimilarPost } from '#layers/feedlog/server/utils/similar'
import type { MergeDirection } from './-post-logic'

const props = defineProps<{
  post: PostDetail
  slug: string
  boards: { id: string; name: string }[]
  boardName: string | null
  isOrgManager: boolean
  merged: boolean
  hasAccount: boolean
  notifyStatus: string | null
  actorName?: string
  actorImage?: string | null
}>()
const emit = defineEmits<{
  boardChange: [boardId: string | null]
  statusChange: [status: string]
  sendNotification: [note: string]
  dismissNotification: []
  sourceConversation: [conversationId: string]
  subscribed: [value: boolean]
  similarMerge: [direction: MergeDirection, targetPost: SimilarPost]
}>()
const { t } = useI18n()
const localePath = useLocalePath()

const editable = computed(() => props.isOrgManager && !props.merged)
const sourceTitle = computed(() => props.post.sourceConversationTitle || t('inbox.sourceConversation'))
// Admins never receive post-thread email, so the card would lie to them.
const canSubscribe = computed(() => !!props.post.id && props.hasAccount && !props.isOrgManager && !props.merged)
const showSimilar = computed(() => !!props.post.id && !props.merged)
const shareClass = computed(() => (props.merged ? 'opacity-50 cursor-not-allowed' : ''))

async function handleShare() {
  // Canonical post URL — independent of current location (post may be opened in a modal)
  const url = `${window.location.origin}/p/${props.slug}`
  try {
    await navigator.clipboard.writeText(url)
    toast.success(t('post.detail.linkCopied'))
  } catch {
    toast.error(t('post.detail.linkCopyFailed'))
  }
}
</script>

<template>
  <aside class="w-full md:w-[320px] shrink-0 self-start space-y-4">
    <div class="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4">
      <PostBoardField :board-id="post.boardId" :board-name="boardName" :boards="boards" :editable="editable" @change="emit('boardChange', $event)" />
      <!-- Status: hidden for merged posts -->
      <PostStatusField
        v-if="!merged"
        :status="post.status"
        :editable="isOrgManager"
        :notify-status="notifyStatus"
        :actor-name="actorName"
        :actor-image="actorImage"
        @change="emit('statusChange', $event)"
        @send="emit('sendNotification', $event)"
        @dismiss="emit('dismissNotification')"
      />
      <PostAuthorField :author="post.author" />
      <div v-if="post.sourceConversationId" data-source-conversation>
        <h4 class="font-heading text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">{{ $t('inbox.sourceConversation') }}</h4>
        <NuxtLink
          :to="localePath(`/dashboard/inbox?conversationId=${post.sourceConversationId}`)"
          :title="sourceTitle"
          class="flex min-w-0 items-center gap-2.5 rounded-sm text-sm font-semibold text-primary underline underline-offset-4 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          @click="emit('sourceConversation', post.sourceConversationId)"
        >
          <Icon name="lucide:message-square" size="16" class="shrink-0" />
          <span class="min-w-0 truncate">{{ sourceTitle }}</span>
        </NuxtLink>
      </div>
      <PostSubscribeCard v-if="canSubscribe" :post-id="post.id" :subscribed="post.subscribed ?? false" @update:subscribed="emit('subscribed', $event)" />
      <div class="pt-2 flex flex-col gap-2">
        <Button variant="outline" class="text-primary" :disabled="merged" :class="shareClass" @click="handleShare"><Icon name="lucide:share-2" size="18" /> {{ $t('post.detail.shareRequest') }}</Button>
      </div>
    </div>
    <SimilarPostsPanel v-if="showSimilar" :post-id="post.id" :is-admin="isOrgManager" @merge="(direction: MergeDirection, target: SimilarPost) => emit('similarMerge', direction, target)" />
  </aside>
</template>
