import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  hasCredentialAccount,
  newPasswordProblem,
  oauthCallbackURL,
  passwordDialogCopy,
  profileFromSession,
  profileNameProblem,
  resolveLoginState,
  sessionEmail,
  signUpProblem,
  vouchingOrgName,
} from '../app/lib/auth-forms'
import { boardFormFields } from '../app/lib/board-form'
import { apiErrorMessage, authErrorMessage } from '../app/lib/form-errors'

const t = (key: string) => `t:${key}`

test('auth errors map known codes, then the server message, then the fallback', () => {
  const codes = { EMAIL_NOT_VERIFIED: 'auth.errors.emailNotVerified' }
  assert.equal(authErrorMessage({ code: 'EMAIL_NOT_VERIFIED' }, t, 'fallback', codes), 't:auth.errors.emailNotVerified')
  assert.equal(authErrorMessage({ code: 'OTHER', message: 'Nope' }, t, 'fallback', codes), 'Nope')
  assert.equal(authErrorMessage({ message: 'Server said' }, t, 'fallback'), 'Server said')
  assert.equal(authErrorMessage({}, t, 'fallback'), 't:fallback')
})

test('API errors use the response message when there is one', () => {
  assert.equal(apiErrorMessage({ data: { message: 'Taken' } }, 'fallback'), 'Taken')
  assert.equal(apiErrorMessage({ data: {} }, 'fallback'), 'fallback')
  assert.equal(apiErrorMessage(new Error('boom'), 'fallback'), 'fallback')
  assert.equal(apiErrorMessage(null, 'fallback'), 'fallback')
})

test('the chooser is skipped only when email is the sole sign-in method', () => {
  assert.equal(resolveLoginState('sign-in', false, true), 'sign-in-email')
  assert.equal(resolveLoginState('sign-in', true, true), 'sign-in')
  assert.equal(resolveLoginState('sign-in', false, false), 'sign-in')
  assert.equal(resolveLoginState('sign-up-email', false, true), 'sign-up-email')
})

test('the vouching organization is named from the session, else by slug', () => {
  const session = { orgList: [{ orgId: 'o1', name: 'Acme' }] }
  assert.equal(vouchingOrgName(session, 'o1', 'acme'), 'Acme')
  assert.equal(vouchingOrgName(session, 'o2', 'other'), 'other')
  assert.equal(vouchingOrgName(null, 'o1', 'acme'), 'acme')
})

test('the session email prefills the form except for guests', () => {
  assert.equal(sessionEmail({ user: { email: 'a@b.co' } }), 'a@b.co')
  assert.equal(sessionEmail({ user: { email: 'guest@x', isAnonymous: true } }), undefined)
  assert.equal(sessionEmail({ user: { email: '' } }), undefined)
  assert.equal(sessionEmail(null), undefined)
})

test('the OAuth callback stays local unless the auth domain is another origin', () => {
  assert.equal(oauthCallbackURL('', 'https://app.example'), '/auth/callback')
  assert.equal(oauthCallbackURL('https://auth.example', undefined), '/auth/callback')
  assert.equal(oauthCallbackURL('not a url', 'https://app.example'), '/auth/callback')
  assert.equal(oauthCallbackURL('https://app.example', 'https://app.example'), '/auth/callback')
  assert.equal(
    oauthCallbackURL('https://auth.example', 'https://app.example'),
    'https://auth.example/api/auth/post-login?return=https%3A%2F%2Fapp.example%2Fauth%2Fcallback',
  )
})

test('sign-up needs every field and an eight-character password', () => {
  assert.equal(signUpProblem({ name: '', email: 'a@b.co', password: 'longenough' }), 'incomplete')
  assert.equal(signUpProblem({ name: 'A', email: '', password: 'longenough' }), 'incomplete')
  assert.equal(signUpProblem({ name: 'A', email: 'a@b.co', password: '' }), 'incomplete')
  assert.equal(signUpProblem({ name: 'A', email: 'a@b.co', password: 'short' }), 'auth.errors.passwordTooShort')
  assert.equal(signUpProblem({ name: 'A', email: 'a@b.co', password: '12345678' }), null)
})

test('a new password must match its confirmation and be long enough', () => {
  assert.equal(newPasswordProblem('12345678', '1234567'), 'auth.errors.passwordsMismatch')
  assert.equal(newPasswordProblem('short', 'short'), 'auth.errors.passwordTooShort')
  assert.equal(newPasswordProblem('12345678', '12345678'), null)
})

test('the password dialog copy follows whether a password exists', () => {
  assert.equal(passwordDialogCopy(true).submit, 'auth.changePassword.submit')
  assert.equal(passwordDialogCopy(true).success, 'auth.success.passwordUpdated')
  assert.equal(passwordDialogCopy(false).submit, 'auth.changePassword.setTitle')
  assert.equal(passwordDialogCopy(null).title, 'auth.changePassword.setTitle')
})

test('only a credential provider counts as an existing password', () => {
  assert.equal(hasCredentialAccount([{ providerId: 'github' }, { providerId: 'credential' }]), true)
  assert.equal(hasCredentialAccount([{ providerId: 'google' }]), false)
  assert.equal(hasCredentialAccount(null), false)
})

test('profile names are required and capped', () => {
  assert.equal(profileNameProblem('', 50), 'auth.profile.nameRequired')
  assert.equal(profileNameProblem('x'.repeat(51), 50), 'auth.profile.nameTooLong')
  assert.equal(profileNameProblem('Ada', 50), null)
})

test('profile and board forms start from the record or blank', () => {
  assert.deepEqual(profileFromSession({ user: { name: 'Ada', image: 'k' } }), { name: 'Ada', image: 'k' })
  assert.deepEqual(profileFromSession({ user: { name: null } }), { name: '', image: null })
  assert.deepEqual(profileFromSession(null), { name: '', image: null })
  assert.deepEqual(boardFormFields({ name: 'Ideas', description: null }), { name: 'Ideas', description: '' })
  assert.deepEqual(boardFormFields({ name: 'Ideas', description: 'All' }), { name: 'Ideas', description: 'All' })
  assert.deepEqual(boardFormFields(undefined), { name: '', description: '' })
})
