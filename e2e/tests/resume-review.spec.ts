import { expect, test } from '../support/test'
import { login } from '../support/app'

test('paste a CV, save it, and get a streamed review with scores', async ({ page }) => {
  const title = `CV collé ${test.info().project.name}`
  await login(page)
  await page.goto('/cv?vue=versions')

  await page.getByRole('button', { name: 'Ajouter une version' }).click()
  await page.getByLabel('Titre').fill(title)
  await page
    .getByLabel('Texte du CV')
    .fill('Camille Martin\nChargée de communication\nAtelier Lumière, 2023-2026\n'.repeat(4))
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  // The new version becomes the current one, shown in the summary card.
  await expect(page.getByText(title).first()).toBeVisible()

  // Same action from the summary card and from the version list: use the card's.
  await page
    .getByRole('button', { name: `Critiquer « ${title} »` })
    .first()
    .click()
  await expect(page).toHaveURL(/vue=critique/)

  // The score rings render once the streamed JSON has been parsed.
  await expect(page.getByRole('img', { name: 'Lisibilité : 8 sur 10' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Compatibilité ATS : 82 sur 100' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Points forts' })).toBeVisible()
  await expect(page.getByText(`Critique de « ${title} »`)).toBeVisible()
})
