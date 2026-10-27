import { expect, test } from '../support/test'
import { login } from '../support/app'

test('a new member is welcomed once, and each page tip closes for good', async ({
  page,
  baseURL,
}) => {
  await login(page)
  const response = await page.context().request.post('/api/invites')
  const { url } = (await response.json()) as { url: string }

  const friend = await page.context().browser()!.newContext({ baseURL })
  const friendPage = await friend.newPage()
  await friendPage.goto(new URL(url).pathname)
  await friendPage.getByLabel('Prénom ou pseudo').fill('Inès Dupont')
  await friendPage.getByLabel('E-mail').fill(`welcome-${Date.now()}@example.com`)
  await friendPage.getByLabel('Mot de passe').fill('a-long-enough-password')
  await friendPage.getByRole('button', { name: 'Créer mon compte' }).click()

  // The welcome dialog, then straight to the CV page and its tip.
  const welcome = friendPage.getByRole('dialog', { name: 'Bienvenue, Inès !' })
  await expect(welcome).toBeVisible()
  await welcome.getByRole('button', { name: 'Commencer par mon CV' }).click()
  await expect(welcome).toBeHidden()
  await expect(friendPage).toHaveURL('/cv')
  const tip = friendPage.getByRole('complementary', { name: 'Ton CV, la base de tout' })
  await expect(tip).toBeVisible()
  await tip.getByRole('button', { name: 'Compris' }).click()
  await expect(tip).toBeHidden()

  // Both stay closed after a reload (stored on the account, not in the browser).
  await friendPage.reload()
  await expect(friendPage.getByRole('heading', { name: 'CV', exact: true })).toBeVisible()
  await expect(friendPage.getByRole('dialog')).toHaveCount(0)
  await expect(tip).toHaveCount(0)

  // The dashboard shows where they are in the first steps.
  await friendPage.goto('/')
  await expect(friendPage.getByText('Premiers pas · 1 sur 4')).toBeVisible()
  await friend.close()
})
