import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import {
  cvTemplates,
  renderedCvSections,
  resolveCvDesign,
  type CvContent,
  type CvSectionConfig,
  type ResolvedCvDesign,
} from '@piston/shared'
import type { CvAssets, CvRenderInput } from './types'
import type { Region } from './engine/boxes'
import type { BlockContext } from './engine/context'
import { bandBlock, bandRegion, headerBlock, sideContactBlock } from './engine/header'
import { keepTitlesWithContent, sectionBlock } from './engine/sections'
import { clean } from './engine/text'
import { computeTokens, readableOn, type CvTokens } from './engine/tokens'

/**
 * The block engine's entry point: a CV document and its design → a pdfmake
 * document definition. Pure: no I/O, no pdfmake import, the same output in
 * the browser and on the server.
 *
 * A page is a layout (single, sidebar-left, sidebar-right, split, banner)
 * filled with blocks: the header (header.ts) and the sections
 * (sections.ts), each drawn in the styles of the resolved design.
 */

/** Renders a document as stored: its template's tokens with the document's overrides. */
export function render(input: CvRenderInput, assets: CvAssets = {}): TDocumentDefinitions {
  return renderResolved(
    input.content,
    resolveCvDesign(cvTemplates[input.templateId], input.design),
    assets,
  )
}

/** Gap between the columns of the `split` layout. */
const SPLIT_GAP = 22
/** Inner padding of the side column, and gap between it and the main column. */
const SIDE_PADDING = 22
const MAIN_GAP = 28

/** Renders with an already resolved design (e.g. an auto-fit loop that tweaks tokens). */
export function renderResolved(
  content: CvContent,
  design: ResolvedCvDesign,
  assets: CvAssets = {},
): TDocumentDefinitions {
  const t = computeTokens(design)
  const { width: W, height: H } = t.page
  const sections = renderedCvSections(content)
  const context = (region: Region, tokens: CvTokens = t): BlockContext => ({
    t: tokens,
    content,
    assets,
    region,
  })
  const isSide = (section: CvSectionConfig) =>
    section.column === 'side' ||
    (section.column === 'auto' &&
      section.key !== 'custom' &&
      design.typography.sideSections.includes(section.key))

  const band = design.layout === 'banner' || design.headerStyle === 'band'
  let pageMargins: [number, number, number, number]
  let body: Content[]
  let background: TDocumentDefinitions['background']

  if (design.layout === 'sidebar-left' || design.layout === 'sidebar-right') {
    const left = design.layout === 'sidebar-left'
    const sideWidth = design.typography.sidebarWidth
    const outer = Math.max(t.margins.x - 10, 24)
    const sideX = left ? 0 : W - sideWidth
    const sideRegion: Region = {
      left: sideX + SIDE_PADDING,
      right: sideX + sideWidth - SIDE_PADDING,
      side: true,
    }
    const mainRegion: Region = left
      ? { left: sideWidth + MAIN_GAP, right: W - outer, side: false }
      : { left: outer, right: W - sideWidth - MAIN_GAP, side: false }
    pageMargins = [0, t.margins.top, 0, t.margins.bottom]

    // Text on the side column must stay readable whatever its background.
    const onSide = readableOn(design.palette.sidebarBg)
    const sideTokens: CvTokens =
      onSide === '#ffffff' ? { ...t, colors: { ...t.colors, text: onSide, muted: onSide } } : t
    const contactInSide = design.headerStyle === 'sidebar'
    const sideCtx = context(sideRegion, sideTokens)
    const side: Content[] = [
      ...(contactInSide ? sideContactBlock(sideCtx, 'Contact') : []),
      ...sections
        .filter(isSide)
        .map((section, index) => sectionBlock(sideCtx, section, index === 0)),
    ]
    const mainCtx = context(mainRegion)
    const main = sections
      .filter((section) => !isSide(section))
      .map((section, index) => sectionBlock(mainCtx, section, index === 0))

    // Name and title come first in the content, aligned with the main
    // column: in reading order (what an ATS extracts) they precede the side column.
    const header: Content = band
      ? bandBlock(
          context(bandRegion(context(mainRegion))),
          headerBlock(context(bandRegion(context(mainRegion))), {
            contactInSide: false,
            band: true,
          }),
          { left: 0, top: t.margins.top, right: 0 },
        )
      : {
          stack: headerBlock(mainCtx, { contactInSide, band: false }),
          margin: [mainRegion.left, 0, W - mainRegion.right, t.space(18)],
        }
    const sideColumn: Column = {
      width: sideWidth,
      stack: [
        { stack: side, margin: [SIDE_PADDING, 0, SIDE_PADDING, 0], color: sideTokens.colors.text },
      ],
    }
    const mainColumn: Column = {
      width: '*',
      // Margins on nested stacks, not on the columns: pdfmake sizes a column
      // by its width and ignores its own horizontal margins.
      stack: [
        {
          stack: main,
          margin: left ? [MAIN_GAP, 0, outer, 0] : [outer, 0, MAIN_GAP, 0],
        },
      ],
    }
    body = [
      header,
      // The main column first for a right sidebar, so it is read first.
      { columns: left ? [sideColumn, mainColumn] : [mainColumn, sideColumn], columnGap: 0 },
    ]
    background = () => ({
      // absolutePosition: without it, pdfmake refuses a canvas taller than the free space.
      absolutePosition: { x: 0, y: 0 },
      canvas: [
        { type: 'rect', x: sideX, y: 0, w: sideWidth, h: H, color: design.palette.sidebarBg },
      ],
    })
  } else {
    const x = t.margins.x
    pageMargins = [x, t.margins.top, x, t.margins.bottom]
    const full: Region = { left: x, right: W - x, side: false }
    const header: Content[] = band
      ? [
          bandBlock(
            context(bandRegion(context(full))),
            headerBlock(context(bandRegion(context(full))), { contactInSide: false, band: true }),
            { left: x, top: t.margins.top, right: x },
          ),
        ]
      : headerBlock(context(full), { contactInSide: false, band: false })

    if (design.layout === 'split') {
      const columnWidth = (W - 2 * x - SPLIT_GAP) / 2
      const firstRegion: Region = { left: x, right: x + columnWidth, side: true }
      const secondRegion: Region = { left: x + columnWidth + SPLIT_GAP, right: W - x, side: true }
      const column = (region: Region, list: CvSectionConfig[]): Column => ({
        width: columnWidth,
        stack: list.map((section, index) => sectionBlock(context(region), section, index === 0)),
      })
      body = [
        ...header,
        {
          columns: [
            column(
              firstRegion,
              sections.filter((section) => !isSide(section)),
            ),
            column(secondRegion, sections.filter(isSide)),
          ],
          columnGap: SPLIT_GAP,
          margin: [0, t.space(14), 0, 0],
        },
      ]
    } else {
      body = [...header, ...sections.map((section) => sectionBlock(context(full), section, false))]
    }
  }

  const name = clean(content.header.fullName)
  return {
    pageSize: { width: W, height: H },
    pageMargins,
    language: design.language === 'fr' ? 'fr-FR' : 'en-GB',
    info: {
      title: name ? `CV — ${name}` : 'CV',
      author: name || undefined,
      subject: clean(content.header.title) || undefined,
      creator: 'Piston',
      producer: 'Piston (pdfmake)',
    },
    defaultStyle: {
      font: t.fonts.body,
      fontSize: t.size.base,
      color: t.colors.text,
      lineHeight: t.lineHeight,
    },
    ...(background && { background }),
    pageBreakBefore: keepTitlesWithContent as TDocumentDefinitions['pageBreakBefore'],
    // One root node: after layout its positions cover every page (page count, fill).
    content: [{ stack: body }],
  }
}
