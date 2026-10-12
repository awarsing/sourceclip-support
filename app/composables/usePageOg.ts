import { buildPageMeta, type OgPage } from '../lib/page-og'

// Per-page title + description, single-sourced into <title> / og: / twitter:.
// The copy lives in buildPageMeta. og:image / og:site_name live in app.vue.
export function usePageOg(page: OgPage) {
  const portal = usePortalOrg()
  const { t } = useI18n()

  const meta = computed(() =>
    buildPageMeta(page, {
      name: portal.value.name,
      isDefault: portal.value.isDefault,
      t: (key, params) => t(key, params),
    }),
  )

  // Passthrough template: <title> stays === og:title, and the org's portal tab
  // doesn't inherit the global "| FeedLog" suffix (dashboard keeps its default).
  useHead({ titleTemplate: '%s' })

  useSeoMeta({
    title: () => meta.value.title,
    ogTitle: () => meta.value.title,
    twitterTitle: () => meta.value.title,
    description: () => meta.value.description,
    ogDescription: () => meta.value.description,
    twitterDescription: () => meta.value.description,
    ogType: () => meta.value.ogType,
    articlePublishedTime: () => meta.value.publishedTime,
  })
}
