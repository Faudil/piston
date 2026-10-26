import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
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
  ensureContrast,
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
import type { CvAssets } from '../types'
import { contactEntries } from '../engine/text'
import { PAGE_SIZES } from '../engine/tokens'

/**
 * Word export (.docx) of a CV document, with the `docx` package (pure JS).
 *
 * Structure-faithful, not pixel-perfect: Word has no equivalent of every
 * header style, section title style or skill gauge of the PDF engine, so
 * each is approximated: the accent color on headings, the template's fonts
 * by name (Word substitutes a font the reader does not have), the section
 * title style (rule, thick rule, filled block, side bar, small capitals,
 * plain), centered or band headers, skill levels as text (« ●●●○○ »), the
 * photo (square: Word cannot clip a round one), the page format and
 * margins, and, for the sidebar layouts, a two-column table with the side
 * column shaded. Real headings (the navigation pane works) and bullets.
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
  /** The accent as text on white: darkened until it reads (4.5:1). */
  primary: string
  /** The accent as a fill or a border. */
  accent: string
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

/** Photo sizes of the design tokens, in points (see engine/header.ts). */
const PHOTO_POINTS = { s: 54, m: 68, l: 86 } as const

/** The photo as a Word image, or null (no photo, hidden, not PNG/JPEG, or its bytes are missing). */
function photoRun(input: CvDocxInput, assets: CvAssets): ImageRun | null {
  const photo = input.content.header.photo
  const url = photo?.visible ? assets.images?.[photo.assetId] : undefined
  const match = url ? /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(url) : null
  if (!photo || !match) return null
  const size = Math.round((PHOTO_POINTS[photo.size] * 96) / 72)
  const bytes = Uint8Array.from(atob(match[2]!), (char) => char.charCodeAt(0))
  return new ImageRun({
    type: match[1]!.toLowerCase() === 'png' ? 'png' : 'jpg',
    data: bytes,
    transformation: { width: size, height: size },
    altText: { name: 'Photo', description: 'Photo', title: 'Photo' },
  })
}

interface HeaderColors {
  name: string
  title: string
  contact: string
  link: string
}

function headerBlocks(
  input: CvDocxInput,
  design: ResolvedCvDesign,
  style: Style,
  assets: CvAssets,
  innerWidth: number,
): Array<Paragraph | Table> {
  const { header } = input.content
  const band = design.layout === 'banner' || design.headerStyle === 'band'
  const bandText = hex(readableOn(design.palette.primary))
  const colors: HeaderColors = band
    ? { name: bandText, title: bandText, contact: bandText, link: bandText }
    : { name: style.text, title: style.primary, contact: style.muted, link: style.primary }
  const centered = design.headerStyle === 'centered'
  const split = design.headerStyle === 'split'
  const alignment = centered ? AlignmentType.CENTER : AlignmentType.LEFT

  const identity: Paragraph[] = []
  const name = header.fullName.trim()
  if (name) {
    identity.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment,
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: name,
            font: style.heading,
            bold: true,
            size: halfPoints(design.typography.nameSize),
            color: colors.name,
          }),
        ],
      }),
    )
  }
  if (header.title.trim()) {
    const caps = design.typography.titleCaps
    identity.push(
      new Paragraph({
        alignment,
        spacing: { after: 60 },
        children: [
          run(style, caps ? header.title.trim().toUpperCase() : header.title.trim(), {
            size: halfPoints(design.typography.titleSize),
            color: colors.title,
            ...(caps && { characterSpacing: 20, bold: true }),
          }),
        ],
      }),
    )
  }

  const entries = contactEntries(input.content)
  const label = (entry: (typeof entries)[number]) => {
    const text = run(style, entry.text, {
      color: entry.target ? colors.link : colors.contact,
      size: halfPoints(style.size * 0.95),
    })
    return entry.target ? new ExternalHyperlink({ link: entry.target, children: [text] }) : text
  }
  const contactLine = (): Paragraph[] =>
    entries.length
      ? [
          new Paragraph({
            alignment,
            spacing: { after: 120 },
            children: entries.flatMap((entry, index) => [
              ...(index ? [run(style, '  ·  ', { color: colors.contact })] : []),
              label(entry),
            ]),
          }),
        ]
      : []
  const contactStack = (): Paragraph[] =>
    entries.map(
      (entry) =>
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 20 },
          children: [label(entry)],
        }),
    )

  const image = photoRun(input, assets)
  const position = header.photo?.position ?? 'left'
  const photoBeside = Boolean(image) && !centered && position !== 'center'
  const photoWidth = photoBeside && header.photo ? twips(PHOTO_POINTS[header.photo.size] + 14) : 0
  // The width left for the text, beside the photo or not.
  const textWidth = innerWidth - photoWidth

  let inner: Array<Paragraph | Table>
  if (split && entries.length) {
    // Name on the left, contact stacked on the right: a borderless two-cell table.
    const right = Math.round(textWidth * 0.4)
    const cell = (children: Paragraph[], width: number) =>
      new TableCell({
        width: { size: width, type: WidthType.DXA },
        borders: NO_BORDERS,
        margins: { left: 0, right: 0, top: 0, bottom: 0 },
        children,
      })
    inner = [
      new Table({
        width: { size: textWidth, type: WidthType.DXA },
        columnWidths: [textWidth - right, right],
        borders: { ...NO_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
        rows: [
          new TableRow({
            children: [cell(identity, textWidth - right), cell(contactStack(), right)],
          }),
        ],
      }),
    ]
  } else {
    inner = [...identity, ...contactLine()]
  }

  // The photo: centered above, or beside the text, in a borderless table.
  if (image && (centered || position === 'center')) {
    inner = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [image],
      }),
      ...inner,
    ]
  } else if (image) {
    const cell = (children: Array<Paragraph | Table>, width: number) =>
      new TableCell({
        width: { size: width, type: WidthType.DXA },
        borders: NO_BORDERS,
        margins: { left: 0, right: 0, top: 0, bottom: 0 },
        children,
      })
    const photoCell = cell([new Paragraph({ children: [image] })], photoWidth)
    const textCell = cell(endWithParagraph(inner), innerWidth - photoWidth)
    inner = [
      new Table({
        width: { size: innerWidth, type: WidthType.DXA },
        columnWidths:
          position === 'left'
            ? [photoWidth, innerWidth - photoWidth]
            : [innerWidth - photoWidth, photoWidth],
        borders: { ...NO_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
        rows: [
          new TableRow({
            children: position === 'left' ? [photoCell, textCell] : [textCell, photoCell],
          }),
        ],
      }),
    ]
  }

  if (!band)
    return [
      ...inner,
      ...(inner.at(-1) instanceof Table ? [new Paragraph({ spacing: { after: 160 } })] : []),
    ]
  // A band: one shaded cell of the accent color around the header.
  return [
    new Table({
      width: { size: innerWidth, type: WidthType.DXA },
      columnWidths: [innerWidth],
      borders: { ...NO_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: innerWidth, type: WidthType.DXA },
              borders: NO_BORDERS,
              margins: { top: 200, bottom: 120, left: 240, right: 240 },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: style.accent },
              children: endWithParagraph(inner),
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 } }),
  ]
}

/** A table cell must end with a paragraph. */
function endWithParagraph(blocks: Array<Paragraph | Table>): Array<Paragraph | Table> {
  return blocks.at(-1) instanceof Table ? [...blocks, new Paragraph({})] : blocks
}

/** « ●●●○○ » for a skill level of 1 to 5. */
function gauge(level: number): string {
  return '●'.repeat(level) + '○'.repeat(Math.max(0, 5 - level))
}

/** The section title in the design's title style, approximated with Word borders and shading. */
function titleParagraph(
  title: string,
  design: ResolvedCvDesign,
  style: Style,
  shaded: boolean,
): Paragraph {
  // On the shaded side column the accent is white: a plain rule is all that stays legible.
  const kind = shaded ? 'rule' : design.sectionTitleStyle
  const block = kind === 'block'
  const text = kind === 'plain' || kind === 'smallcaps' ? title : title.toUpperCase()
  const fill = block ? { type: ShadingType.CLEAR, color: 'auto', fill: style.accent } : undefined
  const color = block ? hex(readableOn(design.palette.primary)) : style.primary
  const line = (size: number) => ({
    style: BorderStyle.SINGLE,
    size,
    space: 2,
    color: style.accent,
  })
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 240, after: 80 },
    ...(fill && { shading: fill }),
    ...(kind === 'rule' || kind === 'sidehead' ? { border: { bottom: line(6) } } : {}),
    ...(kind === 'underline' ? { border: { bottom: line(18) } } : {}),
    ...(kind === 'bar'
      ? { border: { left: { ...line(24), space: 6 } }, indent: { left: 120 } }
      : {}),
    children: [
      new TextRun({
        text,
        font: style.heading,
        bold: true,
        size: halfPoints(style.size * 1.06),
        color,
        ...(kind === 'smallcaps' && { smallCaps: true, characterSpacing: 30 }),
      }),
    ],
  })
}

function sectionParagraphs(
  input: CvDocxInput,
  section: CvSectionConfig,
  design: ResolvedCvDesign,
  style: Style,
  shaded: boolean,
): Paragraph[] {
  const { content } = input
  const language = design.language
  const title = cvSectionTitle(section, language, content.custom)
  const out: Paragraph[] = [titleParagraph(title, design, style, shaded)]
  const bulleted = BULLETED.has(section.key)
  // Rated skills: « Outils » then « Figma ●●●●○ » lines (the level as text).
  if (section.key === 'skills' && content.skills.some((g) => g.items.some((i) => i.level > 0))) {
    for (const group of content.skills) {
      if (group.name.trim()) {
        out.push(
          new Paragraph({
            keepNext: true,
            spacing: { before: 100, after: 20 },
            children: [run(style, group.name.trim(), { bold: true })],
          }),
        )
      }
      for (const skill of group.items) {
        if (!skill.name.trim()) continue
        out.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [
              run(style, skill.name.trim()),
              ...(skill.level > 0
                ? [run(style, `  ${gauge(skill.level)}`, { color: style.primary })]
                : []),
            ],
          }),
        )
      }
    }
    return out
  }
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
export async function renderCvDocx(input: CvDocxInput, assets: CvAssets = {}): Promise<Uint8Array> {
  const design = resolveCvDesign(cvTemplates[input.templateId], input.design)
  const pairing = cvFontPairings[design.fontPairing]
  const style: Style = {
    heading: WORD_FONT_NAMES[pairing.heading],
    body: WORD_FONT_NAMES[pairing.body],
    text: hex(design.palette.text),
    muted: hex(design.palette.muted),
    primary: hex(ensureContrast(design.palette.primary, '#ffffff')),
    accent: hex(design.palette.primary),
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
  const paragraphs = (list: CvSectionConfig[], from: Style, shaded = false) =>
    list.flatMap((section) => sectionParagraphs(input, section, design, from, shaded))
  const headerWidth = twips(page.width - 2 * margins[0])

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
      accent: onSide === 'FFFFFF' ? 'FFFFFF' : style.accent,
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
    const side = cell(paragraphs(sections.filter(isSide), sideStyle, true), sideWidth, true)
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
      ...headerBlocks(input, design, style, assets, headerWidth),
      new Table({
        width: { size: innerWidth, type: WidthType.DXA },
        columnWidths: left ? [sideWidth, mainWidth] : [mainWidth, sideWidth],
        borders: { ...NO_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
        rows: [new TableRow({ children: left ? [side, main] : [main, side] })],
      }),
    ]
  } else {
    body = [
      ...headerBlocks(input, design, style, assets, headerWidth),
      ...paragraphs(sections, style),
    ]
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
