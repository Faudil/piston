import type { InjectionKey } from 'vue'
import type { CvEditBody } from '@piston/shared'

/** A request to the `cv-edit` route without the document id (the editor adds it). */
export type CvEditRequest = CvEditBody extends infer Body
  ? Body extends unknown
    ? Omit<Body, 'documentId'>
    : never
  : never

/** Asks the editor page for a Claude proposal (used by the « IA » menus). */
export type CvAiRequest = (body: CvEditRequest, label: string) => void

export const CV_AI_REQUEST: InjectionKey<CvAiRequest> = Symbol('cv-ai-request')
