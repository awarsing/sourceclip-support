<script setup lang="ts">
import { resolveAttachmentUrl } from '~/utils/attachment'
import { adminStatusBadge, adminTypeBadgeClass, formatListDate } from '~/lib/pages/changelog'

const props = defineProps<{ item: ChangelogAdminListItem }>()
const emit = defineEmits<{ select: [id: string] }>()
const categoryLabel = useChangelogCategoryLabels()

const status = computed(() => adminStatusBadge(props.item.status))
const coverUrl = computed(() => resolveAttachmentUrl(props.item.cover))
const date = computed(() => formatListDate(props.item.publishedAt ?? props.item.updatedAt))
</script>

<template>
  <button type="button" class="flex w-full gap-[16px] px-[24px] py-[20px] text-left transition-colors hover:bg-muted/40" @click="emit('select', item.id)">
    <div class="relative h-[88px] w-[136px] shrink-0 overflow-hidden rounded-[8px] border border-border bg-muted">
      <img v-if="coverUrl" :src="coverUrl" alt="" class="size-full object-cover">
      <div v-else class="flex size-full items-center justify-center px-[8px] text-center text-[11px] font-medium leading-[16px] text-muted-foreground">
        {{ $t('changelog.admin.noImage') }}
      </div>
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-[12px] gap-y-[4px]">
        <p class="font-heading text-[18px] font-bold leading-[26px] text-foreground">
          {{ item.title }}
        </p>
        <div v-if="item.categories?.length" class="flex flex-wrap items-center gap-[6px]">
          <span
            v-for="type in item.categories"
            :key="type"
            class="inline-flex h-[22px] items-center rounded-[6px] border px-[8px] text-[11px] font-bold capitalize leading-[16px]"
            :class="adminTypeBadgeClass(type)"
          >
            {{ categoryLabel[type] ?? type }}
          </span>
        </div>
      </div>

      <div class="mt-[12px] flex flex-wrap items-center gap-x-[16px] gap-y-[8px]">
        <span class="inline-flex h-[24px] items-center gap-[4px] rounded-[6px] border px-[8px] text-[11px] font-semibold leading-[16px] capitalize" :class="status.tone">
          <Icon :name="status.icon" size="12" class="opacity-80" />
          {{ $t(`changelog.admin.status.${item.status}`) }}
        </span>

        <span class="inline-flex items-center gap-[6px] text-[12px] font-medium leading-[18px] text-muted-foreground">
          <Icon name="lucide:clock" size="14" class="shrink-0 opacity-70" />
          {{ date }}
        </span>
      </div>
    </div>
  </button>
</template>
