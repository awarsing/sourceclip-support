<script setup lang="ts">
import { activeNavItem } from '~/lib/pages/layout'

const { signOut } = useAuth()
const { data: session } = await useAuthSession()
const localePath = useLocalePath()

const user = computed(() => session.value?.user)
const { showLoginModal, showChangePassword, showEditProfile, onChangePassword, onEditProfile } =
  useAccountDialogs(session)

async function handleSignOut() {
  await signOut()
  session.value = null
  navigateTo(localePath('/'))
}

const { mainNav, settingsNav, developerNav } = useDashboardNav()

// Mobile menu
const mobileMenuOpen = ref(false)
const route = useRoute()
watch(
  () => route.path,
  () => {
    mobileMenuOpen.value = false
  },
)

const { t } = useI18n()
const config = useRuntimeConfig()
const settingsTitle = computed(() =>
  t(config.public.rootDomain ? 'dashboard.nav.organizationSettings' : 'dashboard.nav.settings'),
)
const isPersonalSettings = computed(() => route.path === localePath('/dashboard/settings/personal'))
const navTitle = computed(() => {
  if (isPersonalSettings.value) return t('settings.personal.title')
  const match = activeNavItem([...mainNav.value, ...settingsNav.value, ...developerNav.value], route.path, localePath)
  return match?.label ?? t('nav.dashboard')
})
useHead({ title: () => navTitle.value })

const { count: inboxCount, refresh: refreshInboxCount } = useInboxBadge()
const { canModerate } = usePermission(
  computed(() => undefined),
  'post',
)
let inboxTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  if (canModerate.value) void refreshInboxCount()
  inboxTimer = setInterval(() => {
    if (!document.hidden && canModerate.value) void refreshInboxCount()
  }, 10000)
})
onBeforeUnmount(() => clearInterval(inboxTimer))
// Developer section: collapsed by default, but auto-expanded when the current
// route lives inside it (so the active page stays visible).
const developerOpen = ref(developerNav.value.some((item) => route.path.startsWith(item.to)))
const accountMenu = computed(() => ({ user: user.value, personalSettings: isPersonalSettings.value }))
</script>

<template>
  <div class="h-screen overflow-hidden flex flex-col md:flex-row bg-background text-foreground font-body">
    <!-- Mobile header -->
    <header class="md:hidden h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-4">
      <div class="flex items-center gap-3">
        <button
          class="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background transition-colors text-muted-foreground"
          @click="mobileMenuOpen = true"
        >
          <Icon name="lucide:menu" size="20" />
        </button>
        <NuxtLink :to="localePath('/dashboard')" class="flex items-center gap-2">
          <AppLogo :size="28" />
          <span class="font-heading text-lg font-bold tracking-tight">FeedLog</span>
        </NuxtLink>
      </div>
      <div class="flex items-center gap-1">
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
    </header>

    <!-- Mobile Sheet -->
    <Sheet v-model:open="mobileMenuOpen">
      <SheetContent side="left" class="w-[260px] p-0 flex flex-col">
        <SheetTitle class="sr-only">{{ $t('dashboard.nav.srTitle') }}</SheetTitle>
        <SheetDescription class="sr-only">{{ $t('dashboard.nav.srDescription') }}</SheetDescription>

        <!-- Logo -->
        <div class="p-6">
          <NuxtLink :to="localePath('/dashboard')" class="flex items-center gap-3">
            <AppLogo :size="40" />
            <span class="font-heading text-xl font-bold tracking-tight">FeedLog</span>
          </NuxtLink>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 px-4 space-y-8 overflow-y-auto">
          <DashboardNavGroup :title="$t('dashboard.nav.main')" :items="mainNav" :inbox-count="inboxCount" variant="mobile" />
          <DashboardNavGroup :title="settingsTitle" :items="settingsNav" :inbox-count="inboxCount" variant="mobile" />
          <DashboardNavGroup v-if="developerNav.length" v-model:open="developerOpen" :title="$t('dashboard.nav.developer')" :items="developerNav" :inbox-count="inboxCount" variant="mobile" collapsible />
        </nav>

        <!-- User info -->
        <div class="h-16 px-4 border-t border-border flex items-center">
          <DashboardAccountMenu v-bind="accountMenu" variant="mobile" @edit-profile="onEditProfile" @change-password="onChangePassword" @sign-out="handleSignOut" />
        </div>
      </SheetContent>
    </Sheet>

    <!-- Desktop Sidebar -->
    <aside class="hidden md:flex w-16 min-[1360px]:w-[260px] h-full shrink-0 border-r border-border bg-card flex-col">
      <div class="hidden min-[1360px]:block">
        <DashboardSidebarBrand />
        <DashboardSidebarTop />
      </div>

      <!-- Navigation -->
      <nav class="flex-1 px-2 min-[1360px]:px-4 pt-4 min-[1360px]:pt-0 space-y-8 overflow-y-auto">
        <DashboardNavGroup :title="$t('dashboard.nav.main')" :items="mainNav" :inbox-count="inboxCount" variant="desktop" />
        <DashboardNavGroup :title="settingsTitle" :items="settingsNav" :inbox-count="inboxCount" variant="desktop" />
        <!-- Developer (collapsible, collapsed by default) -->
        <DashboardNavGroup v-if="developerNav.length" v-model:open="developerOpen" :title="$t('dashboard.nav.developer')" :items="developerNav" :inbox-count="inboxCount" variant="desktop" collapsible />
      </nav>

      <!-- User info (bottom) -->
      <div class="border-t border-border flex items-center flex-col min-[1360px]:flex-row gap-1 py-3 min-[1360px]:py-0 px-1 min-[1360px]:px-4 min-[1360px]:h-16">
        <DashboardAccountMenu v-bind="accountMenu" variant="desktop" @edit-profile="onEditProfile" @change-password="onChangePassword" @sign-out="handleSignOut" />
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      <slot />
    </main>

    <ChangePasswordDialog v-model:open="showChangePassword" />
    <EditProfileDialog v-model:open="showEditProfile" />
    <LoginModal v-model:open="showLoginModal" />
  </div>
</template>
