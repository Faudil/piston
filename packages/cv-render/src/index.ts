/**
 * @piston/cv-render: the CV renderer, shared by the browser preview (a Web
 * Worker) and the server (PDF export, « Enregistrer comme version »).
 *
 * - `render(input, assets)`: pure, document → pdfmake document definition.
 * - `renderPdf(input, assets, { pdfmake, loadFont })`: PDF bytes, page count,
 *   content boxes for click-to-edit.
 * - Fonts: `prepareCvPdfMake`, `cvFontFiles`, `cvPairingFamilies` (the files
 *   live in packages/cv-render/fonts; `@piston/cv-render/node` reads them in
 *   Node and Bun).
 * - Content ids: `cvContentId`, `parseCvContentId`.
 *
 * See docs/design/cv-builder-v2.md (contracts) and CONTRIBUTING.md
 * (« Adding a CV template »).
 */
export { render, renderResolved } from './render'
export { renderPdf, type CvPdfEngine } from './pdf'
export {
  cvFontDictionary,
  cvFontFamilyName,
  cvFontFiles,
  cvPairingFamilies,
  prepareCvPdfMake,
} from './fonts'
export { cvContentId, parseCvContentId, type CvContentTarget } from './ids'
export { formatLetterDate, renderLetter, renderLetterPdf, type CvLetterInput } from './letter'
export { PAGE_SIZES, computeTokens, type CvTokens } from './engine/tokens'
export { CV_ICONS, iconSvg, type CvIconName } from './engine/icons'
export type {
  CvAssets,
  CvContentBox,
  CvDocumentDefinition,
  CvFontLoader,
  CvPdfMake,
  CvRenderInput,
  CvRenderResult,
} from './types'
