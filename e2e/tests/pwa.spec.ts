import { expect, test } from '../support/test'
import { login } from '../support/app'

test.describe('installable app', () => {
  test('manifest, icons and service worker are served with the right headers', async ({
    request,
  }) => {
    const manifestResponse = await request.get('/manifest.webmanifest')
    expect(manifestResponse.status()).toBe(200)
    expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json')
    const manifest = await manifestResponse.json()
    expect(manifest).toMatchObject({ name: 'Piston', display: 'standalone', start_url: '/' })
    const purposes = manifest.icons.map((icon: { purpose: string }) => icon.purpose)
    expect(purposes).toContain('maskable')
    for (const icon of manifest.icons) {
      const response = await request.get(icon.src)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toBe('image/png')
    }

    const worker = await request.get('/sw.js')
    expect(worker.status()).toBe(200)
    expect(worker.headers()['content-type']).toMatch(/javascript/)
    expect(worker.headers()['cache-control']).toContain('no-cache')

    expect((await request.get('/offline.html')).status()).toBe(200)
  })

  test('the service worker serves the offline page and never caches the API', async ({
    page,
    context,
  }) => {
    await login(page)
    await page.goto('/')
    // Wait for the worker to control the page (registered after load).
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
        )
      }
    })

    const cachedUrls = await page.evaluate(async () => {
      const urls: string[] = []
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) urls.push(request.url)
      }
      return urls
    })
    expect(cachedUrls.some((url) => url.endsWith('/offline.html'))).toBe(true)
    expect(cachedUrls.some((url) => new URL(url).pathname.startsWith('/api/'))).toBe(false)

    await context.setOffline(true)
    await page.goto('/cv').catch(() => {})
    await expect(page.getByRole('heading', { name: 'Tu es hors ligne' })).toBeVisible()
    // API calls reach the network (and fail), they are not answered from a cache.
    const apiResult = await page.evaluate(() =>
      fetch('/api/health').then(
        () => 'answered',
        () => 'failed',
      ),
    )
    expect(apiResult).toBe('failed')
    await context.setOffline(false)
  })
})
