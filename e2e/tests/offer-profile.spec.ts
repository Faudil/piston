import { expect, test } from '../support/test'
import { login } from '../support/app'

test('choosing which CV profile an offer uses', async ({ page }) => {
  // One name per project run: the two projects share the database.
  const project = test.info().project.name
  const profileName = `Profil ${project}`
  const emptyName = `Vide ${project}`
  const title = `Poste ${project}`

  await login(page)
  const api = (path: string, data: object) =>
    page.evaluate(
      async ({ path, data }) => {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        })
        return response.json()
      },
      { path, data },
    )
  const profile = await api('/api/profiles', { name: profileName })
  await api('/api/profiles', { name: emptyName })
  await api('/api/resumes', {
    profileId: profile.id,
    title: 'CV de test',
    rawText: 'Une expérience solide en gestion de projet. '.repeat(5),
  })
  const offer = await api('/api/offers', {
    title,
    company: 'Entreprise Test',
    rawText: 'Nous recherchons une personne pour gérer nos projets. '.repeat(3),
  })

  await page.goto(`/offres/${offer.id}`)
  const picker = page.getByRole('combobox', { name: 'CV pour cette offre' })
  await expect(picker).toContainText('Profil par défaut')

  // A profile without a CV can't back an analysis: it is listed, not selectable.
  await picker.click()
  await expect(page.getByRole('option', { name: new RegExp(emptyName) })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.getByRole('option', { name: profileName }).click()
  await expect(page.getByText('CV modifié pour cette offre', { exact: true })).toBeVisible()

  // The choice is saved and shows on the list of offers.
  await page.reload()
  await expect(picker).toContainText(profileName)
  await page.goto('/offres')
  await expect(page.getByRole('link', { name: new RegExp(title) })).toContainText(
    `CV : ${profileName}`,
  )
})
