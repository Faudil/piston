import { expect, test } from '../support/test'
import { login } from '../support/app'

test('reworking picked paragraphs of a letter, with or without corrections', async ({ page }) => {
  const title = `Poste retravail ${test.info().project.name}`

  await login(page)
  const offer = await page.evaluate(async (title) => {
    const response = await fetch('/api/offers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        company: 'Entreprise Test',
        rawText: 'Nous recherchons une personne pour animer nos réseaux sociaux. '.repeat(3),
      }),
    })
    return response.json()
  }, title)

  await page.goto(`/offres/${offer.id}`)
  await page.getByRole('button', { name: 'Générer la lettre' }).click()
  const first = page.getByRole('textbox', { name: 'Paragraphe 1' })
  const second = page.getByRole('textbox', { name: 'Paragraphe 2' })
  await expect(first).toBeVisible()
  const secondBefore = await second.inputValue()

  // Nothing picked and nothing typed: there is nothing to ask.
  await expect(page.getByRole('button', { name: 'Appliquer les corrections' })).toBeDisabled()

  // A paragraph picked and no corrections: Claude goes over it, the rest stays.
  await page.getByRole('checkbox', { name: 'Retravailler le paragraphe 1' }).check()
  await page.getByRole('button', { name: 'Repasser sur ce paragraphe' }).click()
  await expect(first).toHaveValue(/Atelier Lumière m’a appris/)
  await expect(second).toHaveValue(secondBefore)
  await expect(page.getByText('Paragraphe 1 réécrit')).toBeVisible()
  await expect(
    page.getByRole('checkbox', { name: 'Retravailler le paragraphe 1' }),
  ).not.toBeChecked()

  // The old text can be put back, as an unsaved edit.
  const firstBefore = await first.inputValue()
  await page.getByRole('button', { name: 'Remettre l’ancien texte' }).click()
  await expect(first).not.toHaveValue(firstBefore)
  await expect(page.getByRole('button', { name: 'Remettre l’ancien texte' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeEnabled()

  // Two paragraphs picked, with corrections.
  await page.getByRole('checkbox', { name: 'Retravailler le paragraphe 1' }).check()
  await page.getByRole('checkbox', { name: 'Retravailler le paragraphe 2' }).check()
  await page.getByRole('textbox', { name: /Que veux-tu changer/ }).fill('Plus court')
  await page.getByRole('button', { name: 'Corriger ces paragraphes' }).click()
  await expect(second).toHaveValue(/Atelier Lumière m’a appris/)
  await expect(page.getByText('Paragraphes 1 et 2 : Plus court')).toBeVisible()
})
