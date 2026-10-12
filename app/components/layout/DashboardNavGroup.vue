<script setup lang="ts">
import type { DashboardNavItem } from '~/composables/useDashboardNav'
import { badgeLabel, type NavVariant, navGroupClasses, navGroupVisibility } from '~/lib/pages/layout'

const props = defineProps<{
  title: string
  items: DashboardNavItem[]
  inboxCount: number
  variant: NavVariant
  collapsible?: boolean
}>()
const open = defineModel<boolean>('open', { default: true })
const localePath = useLocalePath()

const cls = computed(() => navGroupClasses(props.variant))
const visibility = computed(() => navGroupVisibility(props.variant, !!props.collapsible && !open.value))
const desktop = computed(() => props.variant === 'desktop')
const badgeCount = (item: DashboardNavItem) => (item.to === '/dashboard/inbox' ? props.inboxCount : 0)
</script>

<template>
  <div>
    <button v-if="collapsible" class="w-full items-center justify-between px-3 mb-2 group" :class="cls.toggle" @click="open = !open">
      <span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">{{ title }}</span>
      <Icon :name="open ? 'lucide:chevron-down' : 'lucide:chevron-right'" size="14" class="text-muted-foreground" />
    </button>
    <p v-else class="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground" :class="cls.heading">{{ title }}</p>
    <div v-show="visibility.shown" class="space-y-1" :class="visibility.listClass">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="localePath(item.to)"
        class="flex items-center gap-3 py-2 rounded-lg text-muted-foreground hover:bg-background hover:text-foreground transition-colors font-semibold"
        :class="cls.link"
        :title="desktop ? item.label : undefined"
        active-class="!bg-secondary !text-primary !font-bold"
      >
        <Icon :name="item.icon" size="20" :class="cls.icon" />
        <span class="text-sm" :class="cls.label">{{ item.label }}</span>
        <span
          v-if="badgeCount(item)"
          class="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary leading-none text-primary-foreground"
          :class="cls.badge"
          :data-inbox-badge="desktop ? '' : undefined"
          :aria-label="$t('inbox.unreadOpenCount', { count: inboxCount })"
        ><span class="relative top-px tabular-nums">{{ badgeLabel(inboxCount) }}</span></span>
      </NuxtLink>
    </div>
  </div>
</template>
