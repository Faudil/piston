import { expect, test } from '../support/test'
import { login } from '../support/app'

test('a new letter can start from a previous one', async ({ page }) => {
  // One title per project run: the two projects share the database.
  const project = test.info().project.name
  const first = `Lettre source ${project}`

  await login(page)
  const createOffer = (title: string) =>
    page.evaluate(async (title) => {
      const response = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          company: 'Entreprise Test',
          rawText: 'Nous recherchons une personne pour gérer nos projets. '.repeat(3),
        }),
      })
      return (await response.json()).id as string
    }, title)

  await page.goto(`/offres/${await createOffer(first)}`)
  await page.getByRole('button', { name: 'Générer la lettre' }).click()
  await expect(page.getByRole('textbox', { name: 'Paragraphe 1' })).toBeVisible()

  await page.goto(`/offres/${await createOffer(`Lettre suivante ${project}`)}`)
  const picker = page.getByRole('combobox', { name: 'Partir d’une lettre précédente' })
  await expect(page.getByRole('radio', { name: /Classique/ })).toBeVisible()
  await picker.click()
  await page.getByRole('option', { name: new RegExp(first) }).click()

  // The model decides the structure: no template to choose any more.
  await expect(page.getByText('Claude garde sa structure et ta façon d’écrire.')).toBeVisible()
  await expect(page.getByRole('radio', { name: /Classique/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Générer la lettre' }).click()
  await expect(page.getByRole('textbox', { name: 'Paragraphe 1' })).toBeVisible()
  await expect(page.getByText('Nouvelle lettre, d’après une lettre précédente')).toBeVisible()
})
