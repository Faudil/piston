import type { Content } from 'pdfmake/interfaces'
import type { CvSectionKey } from '@piston/shared'
import {
  A4,
  MUTED,
  baseDocument,
  bulletList,
  clean,
  contactRuns,
  dateRange,
  headingRuns,
  join,
  joinRuns,
  linkTarget,
  linked,
  displayUrl,
  scale,
  sectionsToRender,
  type CvTemplate,
} from '../shared'

const MARGIN_X = 50
const WIDTH = A4.width - 2 * MARGIN_X

/**
 * « Sobre »: one column, accent-colored section titles over a thin rule,
 * dates aligned right. Linear reading order and standard headings: the
 * safest template for ATS parsing.
 */
export const sobre: CvTemplate = (input) => {
  const { content, design } = input
  const { size, space } = scale(design.density)
  const accent = design.accentColor
  const base = size(10)

  /** Title line of an item: bold title and regular organization on the left, dates on the right. */
  const itemHeading = (main: string, secondary: string, dates: string): Content => ({
    columns: [
      { width: '*', text: headingRuns(main, secondary), fontSize: size(10.5) },
      {
        width: 'auto',
        text: dates,
        color: MUTED,
        fontSize: size(9),
        alignment: 'right',
        margin: [8, 1, 0, 0],
      },
    ],
  })
  const subLine = (value: string): Content[] =>
    value ? [{ text: value, color: MUTED, fontSize: size(9.5), margin: [0, 1, 0, 0] }] : []

  const body: Record<CvSectionKey, () => Content[]> = {
    summary: () => [{ text: clean(content.summary), fontSize: base }],
    experiences: () =>
      content.experiences.map((item) => ({
        stack: [
          itemHeading(item.title, item.organization, dateRange(item.start, item.end, design)),
          ...subLine(clean(item.location)),
          ...bulletList(item.bullets, {
            fontSize: base,
            markerColor: accent,
            margin: [0, space(3), 0, 0],
          }),
        ],
        margin: [0, 0, 0, space(9)],
      })),
    education: () =>
      content.education.map((item) => ({
        stack: [
          itemHeading(item.degree, item.school, dateRange(item.start, item.end, design)),
          ...subLine(join([item.location, item.details], ' · ')),
        ],
        margin: [0, 0, 0, space(7)],
      })),
    skills: () =>
      content.skills.map((group) => ({
        text: [
          ...(clean(group.name) ? [{ text: `${clean(group.name)} : `, bold: true }] : []),
          { text: group.items.map(clean).filter(Boolean).join(', ') },
        ],
        fontSize: base,
        margin: [0, 0, 0, space(3)],
      })),
    languages: () => [
      {
        text: content.languages
          .map((item) => join([item.name, item.level ? `(${item.level})` : ''], ' '))
          .join(' · '),
        fontSize: base,
      },
    ],
    projects: () =>
      content.projects.map((item) => ({
        stack: [
          itemHeading(item.name, item.role, dateRange(item.start, item.end, design)),
          ...(clean(item.url)
            ? [
                {
                  text: [linked(displayUrl(item.url), linkTarget('url', item.url), accent)],
                  fontSize: size(9.5),
                  margin: [0, 1, 0, 0],
                } as Content,
              ]
            : []),
          ...bulletList(item.bullets, {
            fontSize: base,
            markerColor: accent,
            margin: [0, space(3), 0, 0],
          }),
        ],
        margin: [0, 0, 0, space(9)],
      })),
    certifications: () =>
      content.certifications.map((item) => ({
        text: [
          { text: clean(item.name), bold: true },
          ...(join([item.issuer, item.date], ' · ')
            ? [{ text: ` · ${join([item.issuer, item.date], ' · ')}` }]
            : []),
          ...(clean(item.url)
            ? [{ text: ' · ' }, linked(displayUrl(item.url), linkTarget('url', item.url), accent)]
            : []),
        ],
        fontSize: base,
        margin: [0, 0, 0, space(3)],
      })),
    interests: () =>
      content.interests.map((item) => ({
        text: [
          { text: clean(item.name), bold: true },
          ...(clean(item.details) ? [{ text: ` : ${clean(item.details)}` }] : []),
        ],
        fontSize: base,
        margin: [0, 0, 0, space(2)],
      })),
  }

  const sectionTitle = (title: string): Content => ({
    stack: [
      {
        text: title.toUpperCase(),
        bold: true,
        color: accent,
        fontSize: size(10.5),
        characterSpacing: 0.6,
      },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: WIDTH, y2: 0, lineWidth: 0.7, lineColor: accent },
        ],
        margin: [0, space(2), 0, space(6)],
      },
    ],
  })

  const sections: Content[] = sectionsToRender(content, design).map(({ key, title }) => {
    const [first, ...rest] = body[key]()
    // The title stays on the same page as the first item of its section.
    return {
      stack: [
        { stack: [sectionTitle(title), ...(first ? [first] : [])], unbreakable: true },
        ...rest,
      ],
      margin: [0, space(10), 0, 0],
    }
  })

  return {
    ...baseDocument(input),
    pageMargins: [MARGIN_X, space(44), MARGIN_X, space(40)],
    defaultStyle: { ...baseDocument(input).defaultStyle, fontSize: base },
    content: [
      { text: clean(content.header.fullName), fontSize: size(24), bold: true, lineHeight: 1 },
      ...(clean(content.header.title)
        ? [
            {
              text: clean(content.header.title),
              fontSize: size(13),
              color: accent,
              margin: [0, space(4), 0, 0],
            } as Content,
          ]
        : []),
      {
        text: joinRuns(contactRuns(content), '  ·  '),
        fontSize: size(9.5),
        color: MUTED,
        margin: [0, space(6), 0, 0],
      },
      ...sections,
    ],
  }
}
