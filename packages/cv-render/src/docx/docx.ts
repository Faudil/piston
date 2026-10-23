import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ISectionOptions,
} from 'docx'
import {
  cvFontPairings,
  cvSectionBlocks,
  cvSectionTitle,
  cvTemplates,
  readableOn,
  renderedCvSections,
  resolveCvDesign,
  type CvContent,
  type CvDesign,
  type CvFontFamily,
  type CvSectionConfig,
  type CvTemplateId,
  type ResolvedCvDesign,
} from '@piston/shared'
import { contactEntries } from '../engine/text'
import { PAGE_SIZES } from '../engine/tokens'

/**
 * Word export (.docx) of a CV document, with the `docx` package (pure JS).
 *
 * Structure-faithful, not pixel-perfect: Word has no equivalent of the PDF
 * engine's header styles, section title styles or skill gauges. What carries
 * over: the order and titles of the sections, real headings (the navigation
 * pane works), bullets, the palette, the fonts by name (Word substitutes a
 * font the reader does not have), the page format and margins, and, for
 * the sidebar layouts only, a two-column table with the side column shaded.
 * The photo is left out.
 */

/** Names Word knows the families by. Carlito is the metric twin of Calibri. */
const WORD_FONT_NAMES: Record<CvFontFamily, string> = {
  inter: 'Inter',
  carlito: 'Calibri',
  'source-serif-4': 'Source Serif 4',
  'source-sans-3': 'Source Sans 3',
  'open-sans': 'Open Sans',
  'eb-garamond': 'EB Garamond',
  'ibm-plex-sans': 'IBM Plex Sans',
  'playfair-display': 'Playfair Display',
  montserrat: 'Montserrat',
  lora: 'Lora',
  poppins: 'Poppins',
}

/** Sections whose blocks are bulleted, as in the text exports. */
const BULLETED = new Set<string>(['experiences', 'projects', 'volunteering'])

const BULLETS = 'cv-bullets'
const hex = (color: string) => color.replace('#', '').toUpperCase()
/** Points → twips (Word's page unit) and half-points (its font size unit). */
const twips = (points: number) => Math.round(points * 20)
const halfPoints = (points: number) => Math.round(points * 2)

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
} as const

interface Style {
  heading: string
  body: string
  text: string
  muted: string
  primary: string
  size: number
}

export interface CvDocxInput {
  content: CvContent
  design: CvDesign
  templateId: CvTemplateId
}

/** A text run in the document's body font. */
function run(style: Style, text: string, options: Omit<IRunOptions, 'text'> = {}) {
  return new TextRun({
    text,
    font: style.body,
    size: halfPoints(style.size),
    color: style.text,
    ...options,
  })
}

function headerParagraphs(input: CvDocxInput, design: ResolvedCvDesign, style: Style): Paragraph[] {
  const { header } = input.content
  const out: Paragraph[] = []
  const name = header.fullName.trim()
  if (name) {
    out.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: name,
            font: style.heading,
            bold: true,
            size: halfPoints(design.typography.nameSize),
            color: style.text,
          }),
        ],
      }),
    )
  }
  if (header.title.trim()) {
    out.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          run(style, header.title.trim(), {
            size: halfPoints(design.typography.titleSize),
            color: style.primary,
          }),
        ],
      }),
    )
  }
  const entries = contactEntries(input.content)
  if (entries.length) {
    const children = entries.flatMap((entry, index) => {
      const separator = index ? [run(style, '  ·  ', { color: style.muted })] : []
      const label = run(style, entry.text, { color: entry.target ? style.primary : style.muted })
      return [
        ...separator,
        entry.target ? new ExternalHyperlink({ link: entry.target, children: [label] }) : label,
      ]
    })
    out.push(new Paragraph({ spacing: { after: 200 }, children }))
  }
  return out
}

function sectionParagraphs(
  input: CvDocxInput,
  section: CvSectionConfig,
  design: ResolvedCvDesign,
  style: Style,
): Paragraph[] {
  const { content } = input
  const language = design.language
  const title = cvSectionTitle(section, language, content.custom)
  const out: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { before: 240, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 2, color: style.primary } },
      children: [
        new TextRun({
          text: title.toUpperCase(),
          font: style.heading,
          bold: true,
          size: halfPoints(style.size * 1.06),
          color: style.primary,
        }),
      ],
    }),
  ]
  const bulleted = BULLETED.has(section.key)
  for (const block of cvSectionBlocks(content, section, language)) {
    if (block.heading) {
      out.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: 100, after: 0 },
          children: [run(style, block.heading, { bold: true })],
        }),
      )
    }
    if (block.meta) {
      out.push(
        new Paragraph({
          keepNext: block.lines.length > 0,
          spacing: { after: 20 },
          children: [run(style, block.meta, { color: style.muted, italics: true })],
        }),
      )
    }
    for (const line of block.lines) {
      out.push(
        new Paragraph({
          spacing: { after: 40 },
          ...(bulleted ? { numbering: { reference: BULLETS, level: 0 } } : {}),
          children: [run(style, line)],
        }),
      )
    }
  }
  return out
}

/** Builds the .docx of a CV document. */
export async function renderCvDocx(input: CvDocxInput): Promise<Uint8Array> {
  const design = resolveCvDesign(cvTemplates[input.templateId], input.design)
  const pairing = cvFontPairings[design.fontPairing]
  const style: Style = {
    heading: WORD_FONT_NAMES[pairing.heading],
    body: WORD_FONT_NAMES[pairing.body],
    text: hex(design.palette.text),
    muted: hex(design.palette.muted),
    primary: hex(design.palette.primary),
    size: design.typography.baseSize * (1 + 0.06 * design.fontSize),
  }
  const page = PAGE_SIZES[design.pageFormat]
  const margins = { narrow: [40, 32, 30], normal: [50, 44, 40], wide: [64, 54, 48] }[
    design.margins
  ] as [number, number, number]
  const sections = renderedCvSections(input.content)
  const twoColumns = design.layout === 'sidebar-left' || design.layout === 'sidebar-right'
  const isSide = (section: CvSectionConfig) =>
    section.column === 'side' ||
    (section.column === 'auto' &&
      section.key !== 'custom' &&
      design.typography.sideSections.includes(section.key))
  const paragraphs = (list: CvSectionConfig[], from: Style) =>
    list.flatMap((section) => sectionParagraphs(input, section, design, from))

  let body: Array<Paragraph | Table>
  if (twoColumns) {
    const innerWidth = twips(page.width - 2 * margins[0])
    const sideWidth = twips(design.typography.sidebarWidth)
    const mainWidth = innerWidth - sideWidth
    const sideBackground = design.palette.sidebarBg
    const onSide = readableOn(sideBackground) === '#ffffff' ? 'FFFFFF' : style.text
    const sideStyle: Style = {
      ...style,
      text: onSide,
      muted: onSide,
      primary: onSide === 'FFFFFF' ? 'FFFFFF' : style.primary,
    }
    const cell = (children: Paragraph[], width: number, shaded: boolean) =>
      new TableCell({
        width: { size: width, type: WidthType.DXA },
        borders: NO_BORDERS,
        margins: { top: 60, bottom: 60, left: 160, right: 160 },
        ...(shaded && {
          shading: {
            type: ShadingType.CLEAR,
            color: 'auto',
            fill: hex(sideBackground),
          },
        }),
        children: children.length ? children : [new Paragraph({})],
      })
    const side = cell(paragraphs(sections.filter(isSide), sideStyle), sideWidth, true)
    const main = cell(
      paragraphs(
        sections.filter((s) => !isSide(s)),
        style,
      ),
      mainWidth,
      false,
    )
    const left = design.layout === 'sidebar-left'
    body = [
      ...headerParagraphs(input, design, style),
      new Table({
        width: { size: innerWidth, type: WidthType.DXA },
        columnWidths: left ? [sideWidth, mainWidth] : [mainWidth, sideWidth],
        borders: { ...NO_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
        rows: [new TableRow({ children: left ? [side, main] : [main, side] })],
      }),
    ]
  } else {
    body = [...headerParagraphs(input, design, style), ...paragraphs(sections, style)]
  }

  const section: ISectionOptions = {
    properties: {
      page: {
        size: { width: twips(page.width), height: twips(page.height) },
        margin: {
          left: twips(margins[0]),
          right: twips(margins[0]),
          top: twips(margins[1]),
          bottom: twips(margins[2]),
        },
      },
    },
    children: body,
  }
  const name = input.content.header.fullName.trim()
  const document = new Document({
    creator: 'Piston',
    title: name ? `CV — ${name}` : 'CV',
    styles: {
      default: {
        document: {
          run: {
            font: style.body,
            size: halfPoints(style.size),
            language: { value: design.language === 'fr' ? 'fr-FR' : 'en-GB' },
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: BULLETS,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    sections: [section],
  })
  return new Uint8Array(await Packer.toBuffer(document))
}
