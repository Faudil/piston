import type { InjectionKey } from 'vue'
import type { CvEditBody } from '@piston/shared'

/** Asks the editor page for a Claude proposal (used by the « IA » menus). */
export type CvAiRequest = (body: Omit<CvEditBody, 'documentId'>, label: string) => void

export const CV_AI_REQUEST: InjectionKey<CvAiRequest> = Symbol('cv-ai-request')
