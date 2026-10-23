import type { Content, ContentText } from 'pdfmake/interfaces'
import type { CvSectionKey } from '@piston/shared'
import {
  A4,
  MUTED,
  baseDocument,
  bulletList,
  clean,
  contactRuns,
  dateRange,
  displayUrl,
  join,
  joinRuns,
  linkTarget,
  linked,
  scale,
  sectionsToRender,
  tint,
  type CvTemplate,
} from '../shared'

const MARGIN_X = 40
const WIDTH = A4.width - 2 * MARGIN_X

/**
 * « Compact »: one column, smaller type and tight spacing, everything about
 * an item on its title line (title, organization, place, dates on the right),
 * short sections inline. Linear like « Sobre », built to fit on one page.
 */
export const compact: CvTemplate = (input) => {
  const { content, design } = input
  const { size, space } = scale(design.density)
  const accent = design.accentColor
  const base = size(9)

  /** « **Title** — Organization, Place » on the left, dates on the right. */
  const line = (main: string, secondary: string, place: string, dates: string): Content => {
    const runs: ContentText[] = []
    if (clean(main)) runs.push({ text: clean(main), bold: true })
    const rest = join([secondary, place], ', ')
    if (rest) runs.push({ text: runs.length ? ` — ${rest}` : rest })
    return {
      columns: [
        { width: '*', text: runs, fontSize: size(9.5) },
        {
          width: 'auto',
          text: dates,
          color: MUTED,
          fontSize: size(8.5),
          alignment: 'right',
          margin: [6, 1, 0, 0],
        },
      ],
    }
  }

  const bullets = (list: Array<{ text: string }>) =>
    bulletList(list, { fontSize: base, markerColor: accent, margin: [0, space(1.5), 0, 0] })

  const inline = (parts: string[]): Content[] =>
    parts.length ? [{ text: parts.join('  ·  '), fontSize: base }] : []

  const body: Record<CvSectionKey, () => Content[]> = {
    summary: () => [{ text: clean(content.summary), fontSize: base }],
    experiences: () =>
      content.experiences.map((item) => ({
        stack: [
          line(
            item.title,
            item.organization,
            item.location,
            dateRange(item.start, item.end, design),
          ),
          ...bullets(item.bullets),
        ],
        margin: [0, 0, 0, space(5)],
      })),
    education: () =>
      content.education.map((item) => ({
        stack: [
          line(item.degree, item.school, item.location, dateRange(item.start, item.end, design)),
          ...(clean(item.details)
            ? [{ text: clean(item.details), color: MUTED, fontSize: base } as Content]
            : []),
        ],
        margin: [0, 0, 0, space(4)],
      })),
    projects: () =>
      content.projects.map((item) => ({
        stack: [
          {
            columns: [
              {
                width: '*',
                fontSize: size(9.5),
                text: [
                  { text: clean(item.name), bold: true },
                  ...(clean(item.role) ? [{ text: ` — ${clean(item.role)}` }] : []),
                  ...(clean(item.url)
                    ? [
                        { text: ' · ' },
                        linked(displayUrl(item.url), linkTarget('url', item.url), accent),
                      ]
                    : []),
                ],
              },
              {
                width: 'auto',
                text: dateRange(item.start, item.end, design),
                color: MUTED,
                fontSize: size(8.5),
                alignment: 'right',
                margin: [6, 1, 0, 0],
              },
            ],
          },
          ...bullets(item.bullets),
        ],
        margin: [0, 0, 0, space(5)],
      })),
    skills: () =>
      content.skills.map((group) => ({
        text: [
          ...(clean(group.name) ? [{ text: `${clean(group.name)} : `, bold: true }] : []),
          { text: group.items.map(clean).filter(Boolean).join(', ') },
        ],
        fontSize: base,
        margin: [0, 0, 0, space(2)],
      })),
    languages: () =>
      inline(
        content.languages.map((item) =>
          join([item.name, item.level ? `(${item.level})` : ''], ' '),
        ),
      ),
    certifications: () =>
      inline(content.certifications.map((item) => join([item.name, item.issuer, item.date], ', '))),
    interests: () =>
      inline(
        content.interests.map((item) =>
          join([item.name, item.details ? `(${item.details})` : ''], ' '),
        ),
      ),
  }

  const sectionTitle = (title: string): Content => ({
    stack: [
      {
        text: title.toUpperCase(),
        bold: true,
        color: accent,
        fontSize: size(9.5),
        characterSpacing: 0.6,
      },
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: WIDTH,
            y2: 0,
            lineWidth: 0.5,
            lineColor: tint(accent, 0.55),
          },
        ],
        margin: [0, space(1.5), 0, space(4)],
      },
    ],
  })

  const sections: Content[] = sectionsToRender(content, design).map(({ key, title }) => {
    const [first, ...rest] = body[key]()
    return {
      stack: [
        { stack: [sectionTitle(title), ...(first ? [first] : [])], unbreakable: true },
        ...rest,
      ],
      margin: [0, space(7), 0, 0],
    }
  })

  const title = clean(content.header.title)
  const document = baseDocument(input)
  return {
    ...document,
    pageMargins: [MARGIN_X, space(32), MARGIN_X, space(30)],
    defaultStyle: { ...document.defaultStyle, fontSize: base, lineHeight: 1.15 },
    content: [
      {
        text: [
          { text: clean(content.header.fullName), fontSize: size(19), bold: true },
          ...(title ? [{ text: `   ${title}`, fontSize: size(11.5), color: accent }] : []),
        ],
        lineHeight: 1,
      },
      {
        text: joinRuns(contactRuns(content), '  ·  '),
        fontSize: size(8.5),
        color: MUTED,
        margin: [0, space(4), 0, 0],
      },
      ...sections,
    ],
  }
}
