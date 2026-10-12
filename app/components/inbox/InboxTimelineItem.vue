<script setup lang="ts">
import type { EmailResult, InboxCustomer, InboxMessage } from '#layers/feedlog/shared/inbox/types'
import { bubbleClass, messageAuthorLabel } from '~/lib/pages/inbox'

const props = defineProps<{
  item: InboxMessage
  customer: InboxCustomer
  email?: EmailResult
  emailSending: boolean
}>()
const emit = defineEmits<{ feedback: [slug: string]; retryEmail: [itemId: string] }>()
const { t } = useI18n()
const { authorName } = useAuthorDisplay()
const time = useConversationTime()

const staff = computed(() => props.item.authorType === 'staff')
const authorLabel = computed(() => messageAuthorLabel(props.item, props.customer, t, authorName))
const avatarAuthor = computed(() => props.item.author || (props.item.authorType === 'customer' ? props.customer : null))
</script>

<template>
  <article :data-inbox-message="item.id">
    <InboxSystemNotices v-if="item.authorType === 'system'" :item="item" />
    <div v-else class="flex items-start gap-2.5" :class="{ 'flex-row-reverse': staff }">
      <div v-if="item.authorType === 'agent'" class="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon name="lucide:bot" size="14" /></div>
      <UserAvatar v-else :author="avatarAuthor" :size="6" />
      <div class="min-w-0 max-w-[85%]">
        <div class="w-fit max-w-full rounded-xl border border-border px-3.5 py-2.5 text-[13px] leading-relaxed" :class="bubbleClass(item.authorType)">
          <WidgetEmbedParts :content="item.content" :plain-text="item.authorType !== 'agent'" @feedback="emit('feedback', $event)" />
        </div>
        <div class="mt-1.5 flex items-center gap-1 px-0.5 text-[10px] text-muted-foreground" :class="{ 'justify-end': staff }">
          <span class="truncate font-semibold text-foreground dark:text-white">{{ authorLabel }}</span><span aria-hidden="true">·</span><time class="shrink-0" :datetime="item.createdAt">{{ time(item.createdAt) }}</time>
        </div>
      </div>
    </div>
    <div v-if="email?.status === 'failed'" role="status" class="mt-3 flex flex-wrap items-center justify-center gap-2 text-center text-[11px] text-muted-foreground">
      <Icon name="lucide:mail" size="12" />
      <span>{{ emailSending ? t('inbox.emailSending') : t('inbox.emailFailed') }}</span>
      <button v-if="email.canRetry" class="rounded-sm font-semibold text-primary underline underline-offset-4 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" @click="emit('retryEmail', item.id)">{{ t('inbox.retryEmail') }}</button>
    </div>
  </article>
</template>
