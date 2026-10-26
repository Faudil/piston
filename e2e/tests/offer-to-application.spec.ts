import { expect, test } from '../support/test'
import { login } from '../support/app'

test('offer → analysis → cover letter → edit and save → kanban', async ({ page }) => {
  // One title per project run: the two projects share the database.
  const title = `Chargé de communication ${test.info().project.name}`

  await login(page)
  await page.goto('/offres')
  // The form is open by default on an empty list, behind a button otherwise.
  const newOffer = page.getByRole('button', { name: 'Nouvelle offre' })
  if (await newOffer.isVisible()) await newOffer.click()
  await page.getByLabel('Intitulé du poste').fill(title)
  await page.getByLabel('Entreprise').fill('Entreprise Test')
  await page
    .getByLabel("Texte de l'offre")
    .fill('Nous recherchons un chargé de communication pour animer nos réseaux sociaux. '.repeat(3))
  await page.getByRole('button', { name: 'Enregistrer et analyser' }).click()

  // The analysis starts by itself and streams in.
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Score de correspondance : 78 sur 100' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: "Questions d'entretien probables" })).toBeVisible()

  // Cover letter.
  await page.getByRole('button', { name: 'Générer la lettre' }).click()
  const paragraph = page.getByRole('textbox', { name: 'Paragraphe 1' })
  await expect(paragraph).toBeVisible()
  await paragraph.fill('Un premier paragraphe retouché par le test.')
  const save = page.getByRole('button', { name: 'Enregistrer', exact: true })
  await save.click()
  await expect(save).toBeDisabled() // nothing left to save
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Paragraphe 1' })).toHaveValue(
    'Un premier paragraphe retouché par le test.',
  )

  // Application tracking.
  await page.getByRole('button', { name: 'Ajouter aux candidatures' }).first().click()
  await page.goto('/candidatures')
  const toSend = page.getByRole('region', { name: /^À envoyer/ })
  const card = toSend.getByRole('article').filter({ hasText: title })
  await expect(card).toBeVisible()

  // Move the card with its buttons (the keyboard equivalent of drag and drop).
  await card.getByRole('button', { name: 'Déplacer vers Envoyée' }).click()
  const sent = page.getByRole('region', { name: /^Envoyée/ })
  await expect(sent.getByRole('article').filter({ hasText: title })).toBeVisible()
  await expect(toSend.getByRole('article').filter({ hasText: title })).toHaveCount(0)

  // Detail panel.
  await sent.getByRole('button', { name: new RegExp(title) }).click()
  await expect(page.getByRole('dialog', { name: title })).toBeVisible()
})
