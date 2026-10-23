import type { CvAssets, CvRenderInput, CvRenderResult } from '@piston/cv-render'
import type { CvRenderRequest, CvRenderResponse } from '~/workers/cv-render-protocol'

/**
 * The page's CV render worker (app/workers/cv-render.worker.ts), shared by
 * every component that renders a CV (the preview, gallery thumbnails): one
 * worker, so pdfmake and the fonts are loaded once. Created on first use in
 * the browser, terminated when the last component using it unmounts.
 *
 * `render(input, assets, channel)` resolves with the result, or with null
 * when a newer request of the same channel replaced it (see
 * cv-render-protocol.ts). Never call it during SSR.
 */

interface Pending {
  resolve: (result: (CvRenderResult & { durationMs: number }) | null) => void
  reject: (error: Error) => void
}

let worker: Worker | null = null
let users = 0
let nextId = 1
const waiting = new Map<number, Pending>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/cv-render.worker.ts', import.meta.url), {
    type: 'module',
    name: 'cv-render',
  })
  worker.onmessage = (event: MessageEvent<CvRenderResponse>) => {
    const message = event.data
    const entry = waiting.get(message.id)
    if (!entry) return
    waiting.delete(message.id)
    if (message.type === 'rendered')
      entry.resolve({ ...message.result, durationMs: message.durationMs })
    else if (message.type === 'skipped') entry.resolve(null)
    else entry.reject(new Error(message.message))
  }
  worker.onerror = (event) => {
    // A worker that fails to load (old browser, network): every waiting render fails.
    event.preventDefault()
    for (const entry of waiting.values()) entry.reject(new Error('L’aperçu n’a pas pu démarrer.'))
    waiting.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export function useCvRenderWorker() {
  users++
  onBeforeUnmount(() => {
    users--
    if (users > 0 || !worker) return
    worker.terminate()
    worker = null
    for (const entry of waiting.values()) entry.resolve(null)
    waiting.clear()
  })

  function render(
    input: CvRenderInput,
    assets: CvAssets = {},
    channel = 'preview',
  ): Promise<(CvRenderResult & { durationMs: number }) | null> {
    const id = nextId++
    const request: CvRenderRequest = {
      type: 'render',
      id,
      channel,
      // Plain JSON: structured cloning rejects Vue's reactive proxies.
      input: JSON.parse(JSON.stringify(input)) as CvRenderInput,
      assets: JSON.parse(JSON.stringify(assets)) as CvAssets,
    }
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject })
      ensureWorker().postMessage(request)
    })
  }

  return { render }
}
