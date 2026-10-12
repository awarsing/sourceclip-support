// Display names for changelog categories; unknown categories show their key.
export function useChangelogCategoryLabels() {
  const { t } = useI18n()
  return computed<Record<string, string>>(() => ({
    new: t('changelog.category.new'),
    improved: t('changelog.category.improved'),
    fixed: t('changelog.category.fixed'),
  }))
}
