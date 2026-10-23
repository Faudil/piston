import type { Column, Content, ContentText } from 'pdfmake/interfaces'
import { cvContentId } from '../ids'
import { tagBox, type Region } from './boxes'
import { lineBox, margin, regionWidth, type BlockContext } from './context'
import { iconSvg } from './icons'
import { sectionTitleBlock } from './sections'
import { clean, contactEntries, joinRuns, linked, type ContactEntry } from './text'

/**
 * The header: name, title, contact details and photo, in the design's
 * header style. Layouts decide where it goes (see layout.ts); the
 * `sidebar` style is split by the layout between the main column (name,
 * title) and the side column (`sideContactBlock`: photo, contact).
 */

const PHOTO_SIZES = { s: 54, m: 68, l: 86 } as const

/** The photo as a pdfmake node, or null (no photo, hidden, or its image is missing). */
export function photoBlock(ctx: BlockContext, alignment?: 'center'): Content | null {
  const photo = ctx.content.header.photo
  if (!photo?.visible) return null
  const image = ctx.assets.images?.[photo.assetId]
  // pdfkit embeds PNG and JPEG only.
  if (!image || !/^data:image\/(png|jpe?g);base64,/i.test(image)) return null
  const size = PHOTO_SIZES[photo.size]
  const box = (node: Content) =>
    tagBox(node, cvContentId.photo, ctx.region, { lastLine: size, fit: true })
  if (photo.shape === 'square') {
    return box({ image, width: size, height: size, ...(alignment && { alignment }) })
  }
  // Round and rounded corners: an SVG clip path around the image.
  const clip =
    photo.shape === 'round'
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/>`
      : `<rect width="${size}" height="${size}" rx="${size * 0.14}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><clipPath id="photo">${clip}</clipPath></defs><image width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" xlink:href="${image}" clip-path="url(#photo)"/></svg>`
  return box({ svg, width: size, height: size, ...(alignment && { alignment }) })
}

interface HeaderColors {
  name: string
  title: string
  contact: string
  icon: string
}

/** Name and title, tagged. */
function identity(ctx: BlockContext, colors: HeaderColors, alignment?: 'center'): Content[] {
  const { t, content, region } = ctx
  const name = clean(content.header.fullName)
  const title = clean(content.header.title)
  const blocks: Content[] = []
  if (name) {
    blocks.push(
      tagBox(
        {
          text: name,
          font: t.fonts.heading,
          fontSize: t.size.name,
          bold: true,
          lineHeight: 1,
          color: colors.name,
          ...(alignment && { alignment }),
        },
        cvContentId.header('fullName'),
        region,
        { lastLine: t.size.name * 1.15, fit: true },
      ),
    )
  }
  if (title) {
    blocks.push(
      tagBox(
        {
          text: title,
          fontSize: t.size.title,
          color: colors.title,
          margin: margin(0, t.space(4), 0, 0),
          ...(alignment && { alignment }),
        },
        cvContentId.header('title'),
        region,
        { lastLine: lineBox(ctx, t.size.title), fit: true },
      ),
    )
  }
  return blocks
}

/** A contact detail with its icon, as one row. */
function contactItem(
  ctx: BlockContext,
  entry: ContactEntry,
  colors: HeaderColors,
  fontSize: number,
  textWidth: 'auto' | '*',
): Content {
  const run = linked(entry.text, entry.target)
  const text: Content = { text: [run], fontSize, color: colors.contact }
  const node: Content = ctx.t.design.showIcons
    ? {
        columns: [
          {
            svg: iconSvg(entry.icon, colors.icon),
            width: fontSize,
            height: fontSize,
            margin: [0, 0.5, 0, 0],
          },
          { ...text, width: textWidth, margin: [fontSize * 0.5, 0, 0, 0] },
        ],
      }
    : text
  return tagBox(node, entry.id, ctx.region, {
    lastLine: lineBox(ctx, fontSize),
    fit: !ctx.t.design.showIcons,
  })
}

/** The contact details on one or several lines (« a · b · c »), icons in a wrapped row when shown. */
function contactLine(ctx: BlockContext, colors: HeaderColors, alignment?: 'center'): Content[] {
  const { t, content, region } = ctx
  const entries = contactEntries(content)
  if (!entries.length) return []
  const fontSize = t.size.contact
  const margin: [number, number, number, number] = [0, t.space(6), 0, 0]
  if (!t.design.showIcons) {
    const runs: ContentText[] = entries.map((entry) => linked(entry.text, entry.target))
    return [
      tagBox(
        {
          text: joinRuns(runs, '  ·  '),
          fontSize,
          color: colors.contact,
          margin,
          ...(alignment && { alignment }),
        },
        cvContentId.contact,
        region,
        { lastLine: lineBox(ctx, fontSize) },
      ),
    ]
  }
  // With icons, details cannot share a text line: lay them out as rows of
  // columns, starting a new row when the estimated width runs out.
  const available = regionWidth(region)
  const estimate = (entry: ContactEntry) => entry.text.length * fontSize * 0.52 + fontSize * 2.5
  const rows: ContactEntry[][] = [[]]
  let used = 0
  for (const entry of entries) {
    const width = estimate(entry)
    if (used + width > available && rows.at(-1)!.length) {
      rows.push([])
      used = 0
    }
    rows.at(-1)!.push(entry)
    used += width + 12
  }
  return [
    {
      stack: rows.map((row, index) => ({
        columns: [
          ...(alignment ? [{ width: '*', text: '' } as Content] : []),
          ...row.map(
            (entry) =>
              ({
                width: 'auto',
                stack: [contactItem(ctx, entry, colors, fontSize, 'auto')],
              }) as Content,
          ),
          ...(alignment ? [{ width: '*', text: '' } as Content] : []),
        ],
        columnGap: 12,
        margin: [0, index ? t.space(2) : 0, 0, 0] as [number, number, number, number],
      })),
      margin,
    },
  ]
}

/** The contact details stacked, one per line (split header, side column). */
function contactStack(ctx: BlockContext, colors: HeaderColors, alignment?: 'right'): Content[] {
  const fontSize = ctx.region.side ? ctx.t.size.side : ctx.t.size.contact
  return contactEntries(ctx.content).map((entry) => ({
    stack: [contactItem(ctx, entry, colors, fontSize, '*')],
    margin: [0, 0, 0, ctx.t.space(3)] as [number, number, number, number],
    ...(alignment && !ctx.t.design.showIcons && { alignment }),
  }))
}

/** Puts the photo beside (or above) a header block. */
function withPhoto(ctx: BlockContext, block: Content[], photo: Content | null): Content[] {
  if (!photo) return block
  const position = ctx.content.header.photo?.position ?? 'left'
  if (position === 'center') {
    return [{ stack: [photo], alignment: 'center', margin: [0, 0, 0, ctx.t.space(8)] }, ...block]
  }
  const gap = 16
  const photoColumn: Column = { width: 'auto', stack: [photo] }
  const textColumn: Column = { width: '*', stack: block }
  return [
    {
      columns: position === 'left' ? [photoColumn, textColumn] : [textColumn, photoColumn],
      columnGap: gap,
    },
  ]
}

/**
 * The header for the main column (or the full width), in the design's
 * header style. With `contactInSide`, the contact details and photo are
 * left out: the layout draws them in the side column.
 */
export function headerBlock(
  ctx: BlockContext,
  options: { contactInSide: boolean; band: boolean },
): Content[] {
  const { t } = ctx
  const style = t.design.headerStyle
  const colors: HeaderColors = options.band
    ? {
        name: t.colors.onPrimary,
        title: t.colors.onPrimary,
        contact: t.colors.onPrimary,
        icon: t.colors.onPrimary,
      }
    : {
        name: t.colors.text,
        title: t.colors.primaryText,
        contact: t.colors.muted,
        icon: t.colors.primaryText,
      }
  const centered = style === 'centered' ? 'center' : undefined

  if (options.contactInSide) return identity(ctx, colors)

  let block: Content[]
  if (style === 'inline') {
    const name = clean(ctx.content.header.fullName)
    const title = clean(ctx.content.header.title)
    block = [
      tagBox(
        {
          text: [
            {
              text: name,
              font: t.fonts.heading,
              fontSize: t.size.name,
              bold: true,
              color: colors.name,
            },
            ...(title
              ? [{ text: `   ${title}`, fontSize: t.size.title, color: colors.title }]
              : []),
          ],
          lineHeight: 1,
        },
        cvContentId.header('fullName'),
        ctx.region,
        { lastLine: t.size.name * 1.15 },
      ),
      ...contactLine(ctx, colors).map(
        (node) => ({ ...(node as object), margin: [0, t.space(4), 0, 0] }) as Content,
      ),
    ]
  } else if (style === 'split') {
    block = [
      {
        columns: [
          { width: '*', stack: identity(ctx, colors) },
          { width: 'auto', stack: contactStack(ctx, colors, 'right'), margin: [12, 2, 0, 0] },
        ],
      },
    ]
  } else {
    block = [...identity(ctx, colors, centered), ...contactLine(ctx, colors, centered)]
  }
  const photo = photoBlock(ctx, centered)
  return centered && photo
    ? [{ stack: [photo], alignment: 'center', margin: [0, 0, 0, t.space(8)] }, ...block]
    : withPhoto(ctx, block, photo)
}

/** Photo and contact details at the top of the side column (`sidebar` header style). */
export function sideContactBlock(ctx: BlockContext, contactTitle: string): Content[] {
  const { t } = ctx
  const colors: HeaderColors = {
    name: t.colors.text,
    title: t.colors.primaryText,
    contact: t.colors.text,
    icon: t.colors.primaryText,
  }
  const photo = photoBlock(ctx, 'center')
  const contact = contactStack(ctx, colors)
  return [
    ...(photo
      ? [{ stack: [photo], alignment: 'center', margin: [0, 0, 0, t.space(12)] } as Content]
      : []),
    ...(contact.length
      ? [
          {
            stack: [sectionTitleBlock(ctx, contactTitle, 'user', cvContentId.contact), ...contact],
            margin: [0, 0, 0, t.space(10)],
          } as Content,
        ]
      : []),
  ]
}

/**
 * A full-width band of the primary color around `inner`, bleeding to the
 * page edges: negative margins cancel the page margins.
 */
export function bandBlock(
  ctx: BlockContext,
  inner: Content[],
  pageMargins: { left: number; top: number; right: number },
): Content {
  const { t } = ctx
  const padX = Math.max(t.margins.x, 36)
  return {
    table: {
      widths: ['*'],
      body: [[{ stack: inner, margin: [padX, t.space(26), padX, t.space(22)] }]],
    },
    layout: {
      fillColor: () => t.colors.primary,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [-pageMargins.left, -pageMargins.top, -pageMargins.right, t.space(14)],
  }
}

/** The band's inner region: the page width minus the band's padding. */
export function bandRegion(ctx: BlockContext): Region {
  const padX = Math.max(ctx.t.margins.x, 36)
  return { left: padX, right: ctx.t.page.width - padX, side: false }
}
