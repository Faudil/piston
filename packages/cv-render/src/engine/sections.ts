import type { Column, Content, ContentText } from 'pdfmake/interfaces'
import {
  CV_SKILL_MAX_LEVEL,
  cvCefrLabels,
  cvCefrRatio,
  cvLanguageLevelText,
  cvReferencesOnRequestText,
  cvSectionRef,
  cvSectionTitle,
  findCvCustomSection,
  mixColors,
  readableOn,
  tintColor,
  type CvBullet,
  type CvLanguage,
  type CvSectionConfig,
  type CvSectionKey,
  type CvSkillGroup,
} from '@piston/shared'
import { cvContentId } from '../ids'
import { tagBox } from './boxes'
import { lineBox, margin, regionWidth, type BlockContext } from './context'
import { iconSvg, type CvIconName } from './icons'
import { clean, dateRange, displayUrl, headingRuns, join, linkTarget, linked } from './text'

/**
 * Section blocks: titles (five styles), items (four styles), bullets, and
 * the renderers of skills and languages. Each function returns pdfmake
 * content for the column described by `ctx.region`; narrow side columns
 * stack what wide columns put side by side.
 */

const SECTION_ICONS: Record<CvSectionKey | 'custom', CvIconName> = {
  summary: 'user',
  experiences: 'briefcase',
  education: 'graduation-cap',
  skills: 'wrench',
  languages: 'languages',
  projects: 'folder-open',
  certifications: 'badge-check',
  interests: 'heart',
  volunteering: 'hand-heart',
  awards: 'trophy',
  publications: 'book-open',
  references: 'users',
  extras: 'list-plus',
  custom: 'sparkles',
}

// --- Section titles -------------------------------------------------------------

/**
 * A section title in the design's style. `icon` is drawn before it when
 * the design shows icons. Tagged with `id` (a section's content id, or the
 * contact block's).
 */
export function sectionTitleBlock(
  ctx: BlockContext,
  title: string,
  icon: CvIconName,
  id: string,
): Content {
  const { t, region } = ctx
  const style = t.design.sectionTitleStyle
  // « Small capitals »: capitals set smaller and spaced, in one run so the text stays extractable.
  const fontSize =
    (region.side ? t.size.sideSectionTitle : t.size.sectionTitle) *
    (style === 'smallcaps' ? 0.88 : 1)
  const width = regionWidth(region)
  const upper = style !== 'bar'
  const onBlock = style === 'block'
  const color = onBlock ? t.colors.onPrimary : t.colors.primaryText
  const label: ContentText = {
    text: upper ? clean(title).toUpperCase() : clean(title),
    bold: true,
    color,
    font: t.fonts.heading,
    fontSize,
    characterSpacing: style === 'smallcaps' ? 0.9 : upper ? (style === 'underline' ? 0.8 : 0.6) : 0,
  }
  const line: Content = t.design.showIcons
    ? {
        columns: [
          { svg: iconSvg(icon, color), width: fontSize, height: fontSize, margin: [0, 0.5, 0, 0] },
          { ...label, width: '*', margin: [fontSize * 0.45, 0, 0, 0] },
        ],
      }
    : label

  let block: Content
  switch (style) {
    case 'rule':
    case 'smallcaps':
      block = {
        stack: [
          line,
          {
            canvas: [
              {
                type: 'line',
                x1: 0,
                y1: 0,
                x2: width,
                y2: 0,
                lineWidth: style === 'smallcaps' ? 0.4 : 0.6,
                lineColor: style === 'smallcaps' ? t.colors.muted : t.colors.secondary,
              },
            ],
            margin: [0, t.space(2), 0, t.space(6)],
          },
        ],
      }
      break
    case 'underline':
      block = {
        stack: [
          line,
          {
            canvas: [
              {
                type: 'line',
                x1: 0,
                y1: 0,
                x2: 28,
                y2: 0,
                lineWidth: 1.6,
                lineColor: t.colors.primary,
              },
            ],
            margin: [0, t.space(3), 0, t.space(6)],
          },
        ],
      }
      break
    case 'block':
      block = {
        table: { widths: ['*'], body: [[line]] },
        layout: {
          fillColor: () => t.colors.primary,
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 3,
          paddingBottom: () => 2.5,
        },
        margin: [0, 0, 0, t.space(6)],
      }
      break
    case 'bar':
      block = {
        columns: [
          {
            width: 3,
            canvas: [
              { type: 'rect', x: 0, y: 0, w: 3, h: fontSize * 1.25, color: t.colors.primary },
            ],
          },
          { width: '*', stack: [line], margin: [7, 0, 0, 0] },
        ],
        margin: [0, 0, 0, t.space(6)],
      }
      break
    case 'plain':
      block = { stack: [line], margin: [0, 0, 0, t.space(5)] }
      break
  }
  // With a rule under the title, the last position recorded is the rule's: the box ends there.
  const ruled = style === 'rule' || style === 'underline' || style === 'smallcaps'
  return tagBox(block, id, region, { lastLine: ruled ? 2 : lineBox(ctx, fontSize) })
}

// --- Bullets --------------------------------------------------------------------------

function bulletBlocks(ctx: BlockContext, bullets: CvBullet[], fontSize: number): Content[] {
  const { t, region } = ctx
  const items = bullets.filter((bullet) => clean(bullet.text))
  if (!items.length) return []
  const lastLine = lineBox(ctx, fontSize)
  const margin: [number, number, number, number] = [0, t.space(3), 0, 0]
  const tagged = <T extends object>(node: T, bullet: CvBullet) =>
    tagBox(node, cvContentId.bullet(bullet.id), region, { lastLine })

  if (t.design.bulletStyle === 'dot') {
    return [
      {
        ul: items.map((bullet) => tagged({ text: clean(bullet.text) }, bullet)),
        markerColor: t.colors.primary,
        fontSize,
        margin,
      },
    ]
  }
  return [
    {
      stack: items.map((bullet) =>
        tagged(
          t.design.bulletStyle === 'dash'
            ? {
                columns: [
                  { width: fontSize * 0.9, text: '–', color: t.colors.primary },
                  { width: '*', text: clean(bullet.text) },
                ],
              }
            : {
                text: clean(bullet.text),
                margin: [0, 0, 0, t.space(1)] as [number, number, number, number],
              },
          bullet,
        ),
      ),
      fontSize,
      margin,
    },
  ]
}

// --- Items --------------------------------------------------------------------------------

/** An item of any dated section, in a common shape the item styles draw. */
interface Entry {
  id: string
  title: string
  subtitle: string
  place: string
  dates: string
  link: string
  details: string
  bullets: CvBullet[]
  /** Gap after the item, at normal spacing. */
  gap: number
}

const TIMELINE_DATES = 90
const TIMELINE_MARKER = 6

function entryBlock(ctx: BlockContext, entry: Entry): Content {
  // A blank item (just added in the editor) draws nothing, not a lone timeline dot.
  const texts = [entry.title, entry.subtitle, entry.place, entry.dates, entry.details, entry.link]
  if (!texts.some((text) => clean(text)) && !entry.bullets.some((bullet) => clean(bullet.text))) {
    return { text: '' }
  }
  const { t, region } = ctx
  const base = region.side ? t.size.side : t.size.base
  // Side columns are too narrow for dates beside the title.
  const style = region.side ? 'dates-below' : t.design.itemStyle
  const muted = t.colors.muted
  const linkLine: Content[] = clean(entry.link)
    ? [
        {
          text: [
            linked(displayUrl(entry.link), linkTarget('url', entry.link), t.colors.primaryText),
          ],
          fontSize: t.size.small,
          margin: [0, 1, 0, 0],
        },
      ]
    : []
  const details: Content[] = clean(entry.details)
    ? [{ text: clean(entry.details), fontSize: base, margin: [0, 2, 0, 0] }]
    : []
  const bullets = bulletBlocks(ctx, entry.bullets, base)
  const dates = (left: number): Column => ({
    width: 'auto',
    text: entry.dates,
    color: muted,
    fontSize: t.size.meta,
    alignment: 'right',
    // A range never wraps: the title wraps instead.
    noWrap: true,
    margin: margin(left, 1, 0, 0),
  })

  let stack: Content[]
  switch (style) {
    case 'dates-right': {
      const sub = join([entry.place, entry.details], ' · ')
      stack = [
        {
          columns: [
            {
              width: '*',
              text: headingRuns(entry.title, entry.subtitle),
              fontSize: t.size.itemTitle,
            },
            dates(8),
          ],
        },
        ...(sub
          ? [{ text: sub, color: muted, fontSize: t.size.small, margin: [0, 1, 0, 0] } as Content]
          : []),
        ...linkLine,
        ...bullets,
      ]
      break
    }
    case 'dates-below': {
      const meta = join([entry.dates, entry.place], ' · ')
      stack = [
        { text: headingRuns(entry.title, entry.subtitle), fontSize: t.size.itemTitle },
        ...(meta
          ? [{ text: meta, color: muted, fontSize: t.size.meta, margin: [0, 1, 0, 0] } as Content]
          : []),
        ...linkLine,
        ...details,
        ...bullets,
      ]
      break
    }
    case 'compact': {
      const runs: ContentText[] = []
      if (clean(entry.title)) runs.push({ text: clean(entry.title), bold: true })
      const rest = join([entry.subtitle, entry.place], ', ')
      if (rest) runs.push({ text: runs.length ? ` — ${rest}` : rest })
      if (clean(entry.link)) {
        runs.push(
          { text: ' · ' },
          linked(displayUrl(entry.link), linkTarget('url', entry.link), t.colors.primaryText),
        )
      }
      stack = [
        { columns: [{ width: '*', text: runs, fontSize: t.size.itemTitle }, dates(6)] },
        ...(clean(entry.details)
          ? [{ text: clean(entry.details), color: muted, fontSize: base } as Content]
          : []),
        ...bullets,
      ]
      break
    }
    case 'timeline': {
      // Dates | a vertical line with a dot | the item. The line is the
      // border of the middle column, so it runs through the gap below the
      // item (padding of the content cell) and joins the next item's line.
      const sub = clean(entry.place)
      const content: Content = {
        stack: [
          { text: headingRuns(entry.title, entry.subtitle), fontSize: t.size.itemTitle },
          ...(sub
            ? [{ text: sub, color: muted, fontSize: t.size.small, margin: [0, 1, 0, 0] } as Content]
            : []),
          ...linkLine,
          ...details,
          ...bullets,
        ],
        margin: margin(0, 0, 0, t.space(entry.gap)),
      }
      const dot: Content = {
        canvas: [
          {
            type: 'ellipse',
            x: 0,
            y: t.size.itemTitle * 0.62,
            r1: 3,
            r2: 3,
            color: t.colors.primary,
            lineColor: '#ffffff',
            lineWidth: 1.5,
          },
        ],
      }
      return tagBox(
        {
          table: {
            widths: [TIMELINE_DATES, TIMELINE_MARKER, '*'],
            body: [
              [
                {
                  text: entry.dates,
                  color: muted,
                  fontSize: t.size.meta,
                  alignment: 'right',
                  margin: margin(0, 1, 8, 0),
                },
                dot,
                { ...content, margin: margin(8, 0, 0, t.space(entry.gap)) },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (index: number) => (index === 1 ? 0.9 : 0),
            vLineColor: () => t.colors.secondary,
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0,
          },
        },
        cvContentId.item(entry.id),
        region,
        { lastLine: lineBox(ctx, base) },
      )
    }
  }
  return tagBox(
    { stack, margin: margin(0, 0, 0, t.space(entry.gap)) },
    cvContentId.item(entry.id),
    region,
    { lastLine: lineBox(ctx, base) },
  )
}

// --- Simple lines (certifications, interests, publications, references, extras) -----------

interface Line {
  id: string
  /** Bold first part, e.g. the certification's name. */
  main: string
  /** Link of the main part, if any. */
  mainLink?: string
  /** The rest, joined by « · » after the main part. */
  rest: string[]
  /** A link shown at the end. */
  link?: string
  /** Separator between the main part and the rest (« : » for interests). */
  separator?: string
  /** A second line in small type (award details). */
  note?: string
}

/** One line per item; in side columns, the main part on its own line and the rest below. */
function lineBlocks(ctx: BlockContext, lines: Line[]): Content[] {
  const { t, region } = ctx
  const fontSize = region.side ? t.size.side : t.size.base
  // « Compact » puts short lists on one line, like v1's compact template.
  if (!region.side && t.design.itemStyle === 'compact') {
    const text = lines
      .map((line) => join([line.main, ...line.rest], ', '))
      .filter(Boolean)
      .join('  ·  ')
    return text ? [{ text, fontSize }] : []
  }
  return lines.map((line) => {
    const rest = join(line.rest, ' · ')
    const link = line.link && clean(line.link) ? line.link : undefined
    const main = clean(line.main)
    const node: Content = region.side
      ? {
          stack: [
            ...(main
              ? [
                  {
                    text: [
                      linked(main, line.mainLink ? linkTarget('url', line.mainLink) : undefined),
                    ],
                    bold: true,
                  } as Content,
                ]
              : []),
            ...(rest
              ? [{ text: rest, color: t.colors.muted, fontSize: t.size.meta } as Content]
              : []),
            ...(line.note ? [{ text: clean(line.note), fontSize: t.size.meta } as Content] : []),
          ],
          fontSize,
          margin: [0, 0, 0, t.space(5)],
        }
      : {
          stack: [
            {
              text: [
                ...(main ? [{ text: main, bold: true }] : []),
                ...(rest ? [{ text: main ? `${line.separator ?? ' · '}${rest}` : rest }] : []),
                ...(link
                  ? [
                      { text: ' · ' },
                      linked(displayUrl(link), linkTarget('url', link), t.colors.primaryText),
                    ]
                  : []),
              ],
            },
            ...(line.note && clean(line.note)
              ? [
                  {
                    text: clean(line.note),
                    color: t.colors.muted,
                    fontSize: t.size.small,
                  } as Content,
                ]
              : []),
          ],
          fontSize,
          margin: [0, 0, 0, t.space(3)],
        }
    return tagBox(node, cvContentId.item(line.id), region, { lastLine: lineBox(ctx, fontSize) })
  })
}

// --- Skills -----------------------------------------------------------------------------------

/** A gauge: a bar filled to `ratio`, or five dots. */
function gauge(ctx: BlockContext, ratio: number, kind: 'bars' | 'dots', width: number): Column {
  const { t } = ctx
  const empty = tintColor(t.colors.primary, 0.82)
  if (kind === 'bars') {
    return {
      width,
      canvas: [
        { type: 'rect', x: 0, y: 0, w: width, h: 4, r: 2, color: empty },
        ...(ratio > 0
          ? [
              {
                type: 'rect' as const,
                x: 0,
                y: 0,
                w: Math.max(4, width * ratio),
                h: 4,
                r: 2,
                color: t.colors.primary,
              },
            ]
          : []),
      ],
      margin: [0, 3.5, 0, 0],
    }
  }
  const filled = Math.round(ratio * CV_SKILL_MAX_LEVEL)
  return {
    width: CV_SKILL_MAX_LEVEL * 8,
    canvas: Array.from({ length: CV_SKILL_MAX_LEVEL }, (_, index) => ({
      type: 'ellipse' as const,
      x: index * 8 + 3,
      y: 3,
      r1: 2.6,
      r2: 2.6,
      color: index < filled ? t.colors.primary : empty,
    })),
    margin: [0, 2.5, 0, 0],
  }
}

/** « Name ··· gauge » rows, or stacked in side columns. */
function gaugeRow(
  ctx: BlockContext,
  label: Content,
  ratio: number | null,
  kind: 'bars' | 'dots',
): Content {
  const { region } = ctx
  if (ratio === null) return label
  if (region.side && kind === 'bars') {
    return {
      stack: [
        label,
        { stack: [gauge(ctx, ratio, kind, regionWidth(region))], margin: margin(0, 2, 0, 0) },
      ],
    }
  }
  return {
    columns: [{ width: '*', stack: [label] }, gauge(ctx, ratio, kind, region.side ? 40 : 70)],
    columnGap: 8,
  }
}

function skillBlocks(ctx: BlockContext, groups: CvSkillGroup[]): Content[] {
  const { t, region } = ctx
  const fontSize = region.side ? t.size.side : t.size.base
  const style = t.design.skillStyle
  const lastLine = lineBox(ctx, fontSize)
  const names = (group: CvSkillGroup) =>
    group.items.map((skill) => clean(skill.name)).filter(Boolean)
  const groupTitle = (group: CvSkillGroup): Content[] =>
    clean(group.name)
      ? [{ text: clean(group.name), bold: true, fontSize, margin: [0, 0, 0, 1] }]
      : []

  return groups.map((group) => {
    let node: Content
    switch (style) {
      case 'inline':
        node = {
          text: [
            ...(clean(group.name) ? [{ text: `${clean(group.name)} : `, bold: true }] : []),
            { text: names(group).join(', ') },
          ],
          fontSize,
          margin: [0, 0, 0, t.space(3)],
        }
        break
      case 'list':
        node = {
          stack: [...groupTitle(group), { text: names(group).join(' · '), fontSize }],
          margin: [0, 0, 0, t.space(6)],
        }
        break
      case 'tags': {
        // On a dark side column the tags are a lighter shade of the column, with light text.
        const dark = region.side && readableOn(t.design.palette.sidebarBg) === '#ffffff'
        const background = dark
          ? mixColors(t.design.palette.sidebarBg, '#ffffff', 0.16)
          : tintColor(t.colors.primary, 0.86)
        const tagColor = dark ? '#ffffff' : readableOn(background)
        node = {
          stack: [
            ...groupTitle(group),
            {
              // Spaces pad each tag; a plain space separates them (U+00A0 is missing from some subsets).
              text: names(group).flatMap((name, index) => [
                ...(index ? [{ text: '  ' }] : []),
                { text: ` ${name} `, background, color: tagColor },
              ]),
              fontSize: t.size.small,
              lineHeight: t.lineHeight + 0.25,
            },
          ],
          margin: [0, 0, 0, t.space(6)],
        }
        break
      }
      case 'bars':
      case 'dots':
        node = {
          stack: [
            ...groupTitle(group),
            ...group.items
              .filter((skill) => clean(skill.name))
              .map((skill) =>
                tagBox(
                  {
                    stack: [
                      gaugeRow(
                        ctx,
                        { text: clean(skill.name), fontSize },
                        skill.level ? skill.level / CV_SKILL_MAX_LEVEL : null,
                        style,
                      ),
                    ],
                    margin: [0, 0, 0, t.space(2)] as [number, number, number, number],
                  },
                  cvContentId.skill(skill.id),
                  region,
                  { lastLine },
                ),
              ),
          ],
          margin: [0, 0, 0, t.space(5)],
        }
        break
    }
    return tagBox(node, cvContentId.item(group.id), region, { lastLine })
  })
}

// --- Languages ----------------------------------------------------------------------------------

function languageBlocks(ctx: BlockContext, languages: CvLanguage[]): Content[] {
  const { t, region } = ctx
  const fontSize = region.side ? t.size.side : t.size.base
  const style = t.design.languageStyle
  const lastLine = lineBox(ctx, fontSize)
  const language = t.design.language
  const level = (item: CvLanguage) => clean(cvLanguageLevelText(item, language))

  if (style === 'inline' && !region.side) {
    return [
      {
        text: languages
          .map((item) => join([item.name, level(item) ? `(${level(item)})` : ''], ' '))
          .filter(Boolean)
          .join(' · '),
        fontSize,
      },
    ]
  }
  return languages.map((item) => {
    const name = clean(item.name)
    let node: Content
    if (style === 'bars' || style === 'dots') {
      node = gaugeRow(
        ctx,
        {
          text: [
            { text: name, bold: true },
            ...(level(item)
              ? [{ text: ` · ${level(item)}`, color: t.colors.muted, fontSize: t.size.meta }]
              : []),
          ],
          fontSize,
        },
        cvCefrRatio(item.cefr),
        style,
      )
    } else {
      const shown =
        style === 'cefr' && item.cefr
          ? language === 'fr'
            ? cvCefrLabels[item.cefr]
            : item.cefr === 'natif'
              ? 'Native'
              : item.cefr
          : level(item)
      node = {
        text: [
          { text: name, bold: true },
          ...(shown ? [{ text: ` · ${shown}`, color: t.colors.muted }] : []),
        ],
        fontSize,
      }
    }
    return tagBox(
      { stack: [node], margin: [0, 0, 0, t.space(3)] as [number, number, number, number] },
      cvContentId.item(item.id),
      region,
      { lastLine },
    )
  })
}

// --- Section bodies ----------------------------------------------------------------------------

/** The blocks of a section's content, without its title. */
function sectionBody(ctx: BlockContext, section: CvSectionConfig): Content[] {
  const { t, content, region } = ctx
  const language = t.design.language
  const range = (start: string, end: string) => dateRange(start, end, language)
  const fontSize = region.side ? t.size.side : t.size.base

  if (section.key === 'custom') {
    const custom = findCvCustomSection(content, section)
    return (custom?.items ?? []).map((item) =>
      entryBlock(ctx, {
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        place: '',
        dates: clean(item.date),
        link: '',
        details: item.text,
        bullets: [],
        gap: 7,
      }),
    )
  }

  switch (section.key) {
    case 'summary':
      return [
        tagBox({ text: clean(content.summary), fontSize }, cvContentId.summary, region, {
          lastLine: lineBox(ctx, fontSize),
        }),
      ]
    case 'experiences':
    case 'volunteering':
      return content[section.key].map((item) =>
        entryBlock(ctx, {
          id: item.id,
          title: item.title,
          subtitle: item.organization,
          place: item.location,
          dates: range(item.start, item.end),
          link: '',
          details: '',
          bullets: item.bullets,
          gap: 9,
        }),
      )
    case 'education':
      return content.education.map((item) =>
        entryBlock(ctx, {
          id: item.id,
          title: item.degree,
          subtitle: item.school,
          place: item.location,
          dates: range(item.start, item.end),
          link: '',
          details: item.details,
          bullets: [],
          gap: 7,
        }),
      )
    case 'projects':
      return content.projects.map((item) =>
        entryBlock(ctx, {
          id: item.id,
          title: item.name,
          subtitle: item.role,
          place: '',
          dates: range(item.start, item.end),
          link: item.url,
          details: '',
          bullets: item.bullets,
          gap: 9,
        }),
      )
    case 'skills':
      return skillBlocks(ctx, content.skills)
    case 'languages':
      return languageBlocks(ctx, content.languages)
    case 'certifications':
      return lineBlocks(
        ctx,
        content.certifications.map((item) => ({
          id: item.id,
          main: item.name,
          mainLink: item.url,
          rest: [item.issuer, item.date],
          link: region.side ? undefined : item.url,
        })),
      )
    case 'interests':
      return lineBlocks(
        ctx,
        content.interests.map((item) => ({
          id: item.id,
          main: item.name,
          rest: [item.details],
          separator: ' : ',
        })),
      )
    case 'awards':
      return lineBlocks(
        ctx,
        content.awards.map((item) => ({
          id: item.id,
          main: item.name,
          rest: [item.issuer, item.date],
          note: item.details,
        })),
      )
    case 'publications':
      return lineBlocks(
        ctx,
        content.publications.map((item) => ({
          id: item.id,
          main: item.title,
          mainLink: item.url,
          rest: [item.publisher, item.date],
          link: region.side ? undefined : item.url,
        })),
      )
    case 'references':
      if (content.referencesAvailableOnRequest) {
        return [{ text: cvReferencesOnRequestText[language], fontSize }]
      }
      return lineBlocks(
        ctx,
        content.references.map((item) => ({
          id: item.id,
          main: item.name,
          rest: [join([item.role, item.organization], ', '), item.contact],
          separator: ' — ',
        })),
      )
    case 'extras':
      return lineBlocks(
        ctx,
        content.extras.map((item) => ({ id: item.id, main: '', rest: [item.text] })),
      )
  }
}

/**
 * A whole section: title and items.
 *
 * The title must stay on the same page as the first item. pdfmake's
 * `unbreakable` would do it, but nodes inside an unbreakable block keep the
 * positions of its trial layout, which breaks the content boxes; so the
 * title and the first item get pdfmake ids instead, and
 * `keepTitlesWithContent` (the definition's `pageBreakBefore`) moves a title
 * to the next page when its first item does not start on the same page.
 */
export function sectionBlock(ctx: BlockContext, section: CvSectionConfig, first: boolean): Content {
  const ref = cvSectionRef(section)
  const title = cvSectionTitle(section, ctx.t.design.language, ctx.content.custom)
  const head = sectionTitleBlock(ctx, title, SECTION_ICONS[section.key], cvContentId.section(ref))
  const [firstItem, ...rest] = sectionBody(ctx, section)
  const anchor = (node: Content, prefix: string): Content =>
    node && typeof node === 'object' && !Array.isArray(node)
      ? Object.assign(node, { id: `${prefix}${ref}` })
      : node
  return {
    stack: [anchor(head, TITLE_ID), ...(firstItem ? [anchor(firstItem, FIRST_ID)] : []), ...rest],
    margin: [0, first ? 0 : ctx.t.space(10), 0, 0],
  }
}

const TITLE_ID = 'cv-title:'
const FIRST_ID = 'cv-first:'

interface PageNode {
  id?: string
  pageNumbers: number[]
}

/**
 * pdfmake's `pageBreakBefore` callback: breaks the page before a section
 * title whose first item does not start on the title's page.
 */
export function keepTitlesWithContent(
  node: PageNode,
  nodes: { getFollowingNodesOnPage(): PageNode[] },
): boolean {
  if (!node.id?.startsWith(TITLE_ID)) return false
  const first = `${FIRST_ID}${node.id.slice(TITLE_ID.length)}`
  return !nodes.getFollowingNodesOnPage().some((other) => other.id === first)
}
