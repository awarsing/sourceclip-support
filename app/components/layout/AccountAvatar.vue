<script setup lang="ts">
import { resolveAttachmentUrl } from '~/utils/attachment'
import { initialsOf } from '~/lib/pages/layout'

const props = defineProps<{ user?: { name?: string | null; image?: string | null } | null }>()

// Fall back to initials when the image fails to load.
const failed = ref(false)
const avatarUrl = computed(() => resolveAttachmentUrl(props.user?.image))
const initials = computed(() => initialsOf(props.user?.name))
watch(
  () => props.user,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <Avatar>
    <img v-if="avatarUrl && !failed" :src="avatarUrl" :alt="user?.name ?? undefined" class="aspect-square size-full rounded-full object-cover" referrerpolicy="no-referrer" @error="failed = true">
    <!-- Brand accent (not a neutral gray) so identity chips carry the brand; derived in deriveBrandVars. -->
    <AvatarFallback v-else class="bg-accent text-accent-foreground text-sm font-bold">
      {{ initials }}
    </AvatarFallback>
  </Avatar>
</template>
