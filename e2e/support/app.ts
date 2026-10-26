import { expect, type Page } from '@playwright/test'

/** The user created by packages/db/src/e2e-seed.ts. */
export const USER = { email: 'e2e@example.com', password: 'e2e-password' }

/** Logs in through the form. The submit button is enabled once the page is hydrated. */
export async function login(page: Page, credentials = USER) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(credentials.email)
  await page.getByLabel('Mot de passe').fill(credentials.password)
  await page.getByRole('button', { name: /Se connecter/ }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/**
 * Creates a CV document from the current resume with the fake draft and
 * returns once the editor is open.
 */
export async function createCvFromResume(page: Page) {
  await page.goto('/cv/nouveau')
  await page.getByRole('button', { name: 'Structurer avec Claude' }).click()
  await expect(page).toHaveURL(/\/cv\/editeur\//)
  await expect(page.getByRole('heading', { name: 'Mon CV', level: 1 })).toBeVisible()
}
