import { readFile } from 'node:fs/promises'
import type { Download } from '@playwright/test'
import { expect, test } from '../support/test'
import { createCvFromResume, login } from '../support/app'

async function readDownload(download: Download) {
  return readFile((await download.path())!)
}

test.describe('CV builder', () => {
  test('create from the current CV, change template, export PDF and Word', async ({ page }) => {
    await login(page)
    await createCvFromResume(page)

    // The fake draft is in the editor.
    await expect(page.getByRole('textbox', { name: 'Accroche' })).toHaveValue(/trois ans/)

    // Template gallery.
    await expect(page.getByRole('banner').getByText('Modèle « Sobre »')).toBeVisible()
    await page.getByRole('tab', { name: 'Design' }).click()
    await page.getByRole('button', { name: 'Changer de modèle' }).click()
    await page.getByRole('button', { name: 'Utiliser le modèle Classique' }).click()
    await expect(page.getByRole('banner').getByText('Modèle « Classique »')).toBeVisible()

    // PDF export: a real PDF comes back.
    await page.getByRole('button', { name: 'Exporter ou partager le CV' }).click()
    const pdfDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /^PDF/ }).click()
    const pdf = await readDownload(await pdfDownload)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')

    // Word export: a .docx is a zip archive.
    await page.getByRole('button', { name: 'Exporter ou partager le CV' }).click()
    const docxDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /^Word/ }).click()
    const docx = await docxDownload
    expect(docx.suggestedFilename()).toMatch(/\.docx$/)
    expect((await readDownload(docx)).subarray(0, 2).toString()).toBe('PK')
  })

  test('share link: open without a session, revoke, then 410', async ({
    page,
    browser,
    baseURL,
  }) => {
    await login(page)
    await createCvFromResume(page)

    await page.getByRole('button', { name: 'Exporter ou partager le CV' }).click()
    await page.getByRole('menuitem', { name: /^Lien de partage/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Partager ce CV' })
    await dialog.getByRole('button', { name: 'Créer un lien' }).click()
    const link = await dialog
      .getByRole('textbox', { name: 'Adresse du lien de partage' })
      .inputValue()
    const path = new URL(link).pathname

    // A fresh context has no cookie: this is what the recipient sees.
    const visitor = await browser.newContext({ baseURL })
    const pdf = await visitor.request.get(`/api${path}`)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    const visitorPage = await visitor.newPage()
    await visitorPage.goto(path)
    await expect(visitorPage.getByRole('link', { name: 'Télécharger le PDF' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Désactiver' }).click()
    await expect(dialog.getByText('Aucun lien actif')).toBeVisible()

    expect((await visitor.request.get(`/api${path}`)).status()).toBe(410)
    await visitorPage.goto(path)
    await expect(
      visitorPage.getByRole('heading', { name: 'Ce CV n’est pas disponible' }),
    ).toBeVisible()
    await visitor.close()
  })
})
