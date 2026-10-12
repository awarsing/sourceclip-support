// Pure helpers behind the widget settings page.

export interface DraftRule {
  id: string
  scenario: string
  enabled: boolean
  builtin: boolean
}

interface BuiltinRule {
  id: string
  scenario: string
  scenarioZh: string
}

function isWholeNumberInput(value: number | string) {
  return String(value).trim() !== '' && Number.isInteger(Number(value))
}

/** A launcher offset: a whole number of pixels, at least the minimum. */
export function isValidOffset(value: number | string, min: number) {
  return isWholeNumberInput(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min
}

/** Conversation retention: a whole number of days inside the allowed range. */
export function isValidRetention(value: number | string, min: number, max: number) {
  return isWholeNumberInput(value) && Number(value) >= min && Number(value) <= max
}

/** Whether any field of the draft differs from the saved value of the same key. */
export function differsFrom<T extends object>(draft: T, saved: T) {
  return Object.entries(draft).some(([key, value]) => value !== saved[key as keyof T])
}

/** A section save runs only when nothing else is saving and its draft is changed and valid. */
export function saveBlocked(saving: boolean, dirty: boolean, valid: boolean) {
  return saving || !dirty || !valid
}

/** Built-in rules show the stored text in the reader's language; custom rules show their own text. */
export function ruleLabel(rule: DraftRule, builtins: BuiltinRule[] | undefined, locale: string) {
  const builtin = rule.builtin ? builtins?.find((item) => item.id === rule.id) : undefined
  if (!builtin) return rule.scenario
  return locale.startsWith('zh') ? builtin.scenarioZh : builtin.scenario
}

/**
 * Turning a rule on past the limit is refused; turning one off always works.
 * Returns 'limit' when refused, 'toggled' when applied, null when the rule is gone.
 */
export function toggleDraftRule(rules: DraftRule[], id: string, atLimit: boolean) {
  const target = rules.find((rule) => rule.id === id)
  if (!target) return null
  if (!target.enabled && atLimit) return 'limit'
  target.enabled = !target.enabled
  return 'toggled'
}

/** Save an edited rule's text, or append a new enabled custom rule. */
export function upsertDraftRule(rules: DraftRule[], editingId: string | null, scenario: string, newId: () => string) {
  if (!editingId) {
    rules.push({ id: `new-${newId()}`, scenario, enabled: true, builtin: false })
    return
  }
  const target = rules.find((rule) => rule.id === editingId)
  if (target) target.scenario = scenario
}
