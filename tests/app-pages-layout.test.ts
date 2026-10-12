import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { activeNavItem, badgeLabel, initialsOf } from '../app/lib/pages/layout'

test('initialsOf takes the first two characters, upper-cased', () => {
  assert.equal(initialsOf('ada lovelace'), 'AD')
  assert.equal(initialsOf('x'), 'X')
  assert.equal(initialsOf(null), '')
  assert.equal(initialsOf(undefined), '')
})

test('badgeLabel caps at 99+', () => {
  assert.equal(badgeLabel(7), '7')
  assert.equal(badgeLabel(99), '99')
  assert.equal(badgeLabel(100), '99+')
})

test('activeNavItem prefers the longest matching prefix', () => {
  const items = [
    { to: '/dashboard/settings', label: 'settings' },
    { to: '/dashboard/settings/widget', label: 'widget' },
    { to: '/dashboard/feedback', label: 'feedback' },
  ]
  const resolve = (to: string) => `/en${to}`
  assert.equal(activeNavItem(items, '/en/dashboard/settings/widget', resolve)?.label, 'widget')
  assert.equal(activeNavItem(items, '/en/dashboard/settings/members', resolve)?.label, 'settings')
  assert.equal(activeNavItem(items, '/en/dashboard/feedback', resolve)?.label, 'feedback')
  assert.equal(activeNavItem(items, '/en/dashboard/feedbackx', resolve), undefined)
})
