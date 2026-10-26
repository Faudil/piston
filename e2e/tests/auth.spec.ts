import { expect, test } from '../support/test'
import { USER, login } from '../support/app'

test('logs in with the right password', async ({ page }) => {
  await login(page)
  await expect(page).toHaveURL('/')
})

test('shows an error for a wrong password', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(USER.email)
  await page.getByLabel('Mot de passe').fill('not-the-password')
  await page.getByRole('button', { name: /Se connecter/ }).click()
  await expect(page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('invite link → register → logged-in home', async ({ page, baseURL }) => {
  // An existing member creates the invitation (the API is what the profile menu calls).
  await login(page)
  const api = page.context().request
  const response = await api.post('/api/invites')
  expect(response.ok()).toBe(true)
  const { url } = (await response.json()) as { url: string }

  // A fresh browser context has no session: it is the invited friend.
  const friend = await page.context().browser()!.newContext({ baseURL })
  const friendPage = await friend.newPage()
  const email = `friend-${Date.now()}@example.com`
  await friendPage.goto(new URL(url).pathname)
  await friendPage.getByLabel('Prénom ou pseudo').fill('Nina')
  await friendPage.getByLabel('E-mail').fill(email)
  await friendPage.getByLabel('Mot de passe').fill('a-long-enough-password')
  await friendPage.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(friendPage).not.toHaveURL(/\/invite\//)
  // A new account lands on the CV page, which asks for a first resume.
  await expect(friendPage.getByText('Commence par ton CV')).toBeVisible()

  // The link is single-use.
  await friendPage.context().clearCookies()
  await friendPage.goto(new URL(url).pathname)
  await expect(friendPage.getByRole('button', { name: 'Créer mon compte' })).toHaveCount(0)
  await friend.close()
})
