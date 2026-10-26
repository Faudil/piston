import { expect, test } from '../support/test'
import { createCvFromResume, login } from '../support/app'

test.describe('CV editor on a phone', () => {
  test('one section per screen, section list, preview sheet, action bar', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'phone layout only')
    await login(page)
    await createCvFromResume(page)

    // The action bar replaces the tab bar on this page.
    const bar = page.getByRole('navigation', { name: 'Actions du CV' })
    await expect(bar).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0)
    for (const button of await bar.getByRole('button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }

    // Step 1: the header only.
    const steps = page.getByTestId('step-nav')
    await expect(steps.getByText(/Étape 1 sur \d+/)).toBeVisible()
    await expect(steps.getByText('En-tête', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Nom complet')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Accroche' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Précédent' })).toBeDisabled()

    // Next: the summary alone; typing in it works.
    await page.getByRole('button', { name: 'Suivant' }).click()
    await expect(steps.getByText(/Étape 2 sur \d+/)).toBeVisible()
    const summary = page.getByRole('textbox', { name: 'Accroche' })
    await expect(summary).toBeVisible()
    await expect(page.getByLabel('Nom complet')).toBeHidden()
    await summary.fill('Nouvelle accroche écrite sur mobile.')

    // The section list sheet jumps anywhere.
    await steps.getByRole('button', { name: 'Sections' }).click()
    const sheet = page.getByRole('dialog', { name: 'Sections du CV' })
    await sheet.getByRole('button', { name: /Formation/ }).click()
    await expect(sheet).toBeHidden()
    await expect(steps.getByText('Formation', { exact: true })).toBeVisible()
    await expect(summary).toBeHidden()

    // Back to the summary: what was typed is kept.
    await page.getByRole('button', { name: 'Précédent' }).click()
    await page.getByRole('button', { name: 'Précédent' }).click()
    await expect(summary).toHaveValue('Nouvelle accroche écrite sur mobile.')

    // The preview is a full-screen sheet.
    await bar.getByRole('button', { name: 'Aperçu' }).click()
    const preview = page.getByRole('dialog', { name: 'Aperçu du CV' })
    await expect(preview).toBeVisible()
    await expect(preview.locator('canvas').first()).toBeVisible()
    const box = (await preview.boundingBox())!
    const viewport = page.viewportSize()!
    expect(box.width).toBeGreaterThanOrEqual(viewport.width * 0.95)
    expect(box.height).toBeGreaterThanOrEqual(viewport.height * 0.95)
    await page.keyboard.press('Escape')
    await expect(preview).toBeHidden()

    // The page does not scroll sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
