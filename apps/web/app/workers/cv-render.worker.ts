import { renderPdf, type CvPdfEngine, type CvPdfMake } from '@piston/cv-render'
import type { CvRenderRequest, CvRenderResponse } from './cv-render-protocol'

/**
 * The CV preview's renderer: @piston/cv-render with pdfmake's browser build,
 * off the main thread, so typing never waits for a PDF. pdfmake (~1 MB) is
 * loaded on the first request and the fonts of each pairing on first use
 * (from /cv-fonts/, cached by the browser), so the editor page itself stays
 * light. See cv-render-protocol.ts for the messages.
 */

interface WorkerScope {
  onmessage: ((event: MessageEvent<CvRenderRequest>) => void) | null
  postMessage(message: CvRenderResponse, transfer?: Transferable[]): void
}
const scope = self as unknown as WorkerScope

let engine: Promise<CvPdfEngine> | undefined

function useEngine(): Promise<CvPdfEngine> {
  engine ??= import('pdfmake/build/pdfmake.min')
    .then((module) => {
      const pdfmake = ((module as { default?: unknown }).default ?? module) as CvPdfMake
      return {
        pdfmake,
        async loadFont(file: string) {
          const response = await fetch(`/cv-fonts/${file}`)
          if (!response.ok) throw new Error(`Police introuvable : ${file}`)
          return new Uint8Array(await response.arrayBuffer())
        },
      }
    })
    .catch((error) => {
      engine = undefined
      throw error
    })
  return engine
}

/** Pending requests, the latest per channel, in arrival order. */
const pending = new Map<string, CvRenderRequest>()
let running = false

async function drain() {
  if (running) return
  running = true
  try {
    while (pending.size) {
      const [channel, request] = pending.entries().next().value as [string, CvRenderRequest]
      pending.delete(channel)
      const started = performance.now()
      try {
        const result = await renderPdf(request.input, request.assets, await useEngine())
        scope.postMessage(
          { type: 'rendered', id: request.id, result, durationMs: performance.now() - started },
          [result.pdf.buffer],
        )
      } catch (error) {
        console.error('[cv-render.worker]', error)
        scope.postMessage({
          type: 'error',
          id: request.id,
          message: 'Impossible de générer l’aperçu de ce CV.',
        })
      }
    }
  } finally {
    running = false
  }
}

scope.onmessage = (event) => {
  const request = event.data
  if (request?.type !== 'render') return
  const replaced = pending.get(request.channel)
  if (replaced) scope.postMessage({ type: 'skipped', id: replaced.id })
  // Delete first so the channel moves to the end of the queue.
  pending.delete(request.channel)
  pending.set(request.channel, request)
  void drain()
}
