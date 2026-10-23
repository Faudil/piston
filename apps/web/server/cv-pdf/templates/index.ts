import type { CvTemplateId } from '@piston/shared'
import type { CvTemplate } from '../shared'
import { compact } from './compact'
import { moderne } from './moderne'
import { sobre } from './sobre'

/**
 * Every CV template, by id. Their labels and descriptions live in
 * @piston/shared (`cvTemplates`), because the browser shows them too.
 */
export const CV_TEMPLATES: Record<CvTemplateId, CvTemplate> = {
  sobre,
  moderne,
  compact,
}
