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
  displayUrl,
  headingRuns,
  join,
  linkTarget,
  linked,
  scale,
  sectionsToRender,
  tint,
  type CvTemplate,
} from '../shared'

const SIDEBAR_WIDTH = 190
const SIDEBAR_PADDING = 22
const MAIN_PADDING_LEFT = 28
const MAIN_PADDING_RIGHT = 40

/** Sections shown in the sidebar; the others go to the main column. */
const SIDEBAR_SECTIONS = new Set<CvSectionKey>([
  'skills',
  'languages',
  'certifications',
  'interests',
])

/**
 * « Moderne »: a tinted sidebar (contact, skills, languages, certifications,
 * interests) next to the main column (summary, experiences, education,
 * projects). Each column keeps the user's section order. The sidebar is
 * drawn as a page background so it runs down every page.
 */
export const moderne: CvTemplate = (input) => {
  const { content, design } = input
  const { size, space } = scale(design.density)
  const accent = design.accentColor
  const base = size(9.5)

  const sectionTitle = (title: string, sidebar: boolean): Content => ({
    stack: [
      {
        text: title.toUpperCase(),
        bold: true,
        color: accent,
        fontSize: size(sidebar ? 9.5 : 10.5),
        characterSpacing: 0.8,
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 28, y2: 0, lineWidth: 1.6, lineColor: accent }],
        margin: [0, space(3), 0, space(6)],
      },
    ],
  })

  const itemBlock = (
    main: string,
    secondary: string,
    meta: string,
    extra: Content[],
    gap: number,
  ): Content => ({
    stack: [
      { text: headingRuns(main, secondary), fontSize: size(10.5) },
      ...(meta
        ? [{ text: meta, color: MUTED, fontSize: size(8.5), margin: [0, 1, 0, 0] } as Content]
        : []),
      ...extra,
    ],
    margin: [0, 0, 0, space(gap)],
  })

  const body: Record<CvSectionKey, () => Content[]> = {
    summary: () => [{ text: clean(content.summary), fontSize: base }],
    experiences: () =>
      content.experiences.map((item) =>
        itemBlock(
          item.title,
          item.organization,
          join([dateRange(item.start, item.end, design), item.location], ' · '),
          bulletList(item.bullets, {
            fontSize: base,
            markerColor: accent,
            margin: [0, space(3), 0, 0],
          }),
          9,
        ),
      ),
    education: () =>
      content.education.map((item) =>
        itemBlock(
          item.degree,
          item.school,
          join([dateRange(item.start, item.end, design), item.location], ' · '),
          clean(item.details)
            ? [{ text: clean(item.details), fontSize: base, margin: [0, 2, 0, 0] }]
            : [],
          7,
        ),
      ),
    projects: () =>
      content.projects.map((item) =>
        itemBlock(
          item.name,
          item.role,
          dateRange(item.start, item.end, design),
          [
            ...(clean(item.url)
              ? [
                  {
                    text: [linked(displayUrl(item.url), linkTarget('url', item.url), accent)],
                    fontSize: size(8.5),
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
          9,
        ),
      ),
    // Sidebar sections: narrow column, one fact per line.
    skills: () =>
      content.skills.map((group) => ({
        stack: [
          ...(clean(group.name)
            ? [{ text: clean(group.name), bold: true, fontSize: size(9) } as Content]
            : []),
          {
            text: group.items.map(clean).filter(Boolean).join(' · '),
            fontSize: size(9),
            margin: [0, 1, 0, 0],
          },
        ],
        margin: [0, 0, 0, space(6)],
      })),
    languages: () =>
      content.languages.map((item) => ({
        text: [
          { text: clean(item.name), bold: true },
          ...(clean(item.level) ? [{ text: ` · ${clean(item.level)}`, color: MUTED }] : []),
        ],
        fontSize: size(9),
        margin: [0, 0, 0, space(3)],
      })),
    certifications: () =>
      content.certifications.map((item) => ({
        stack: [
          {
            text: [linked(clean(item.name), linkTarget('url', item.url), undefined)],
            bold: true,
            fontSize: size(9),
          },
          ...(join([item.issuer, item.date], ' · ')
            ? [
                {
                  text: join([item.issuer, item.date], ' · '),
                  color: MUTED,
                  fontSize: size(8.5),
                } as Content,
              ]
            : []),
        ],
        margin: [0, 0, 0, space(5)],
      })),
    interests: () =>
      content.interests.map((item) => ({
        text: [
          { text: clean(item.name), bold: true },
          ...(clean(item.details) ? [{ text: ` : ${clean(item.details)}` }] : []),
        ],
        fontSize: size(9),
        margin: [0, 0, 0, space(3)],
      })),
  }

  const section = (key: CvSectionKey, title: string, sidebar: boolean): Content => {
    const [first, ...rest] = body[key]()
    return {
      // The title stays on the same page as the first item of its section.
      stack: [
        { stack: [sectionTitle(title, sidebar), ...(first ? [first] : [])], unbreakable: true },
        ...rest,
      ],
      margin: [0, 0, 0, space(sidebar ? 10 : 12)],
    }
  }

  const rendered = sectionsToRender(content, design)
  const contact = contactRuns(content).map(
    (run) => ({ ...run, fontSize: size(9), margin: [0, 0, 0, space(3)] }) as Content,
  )
  const sidebar: Content[] = [
    ...(contact.length
      ? [
          {
            stack: [sectionTitle('Contact', true), ...contact],
            margin: [0, 0, 0, space(10)],
          } as Content,
        ]
      : []),
    ...rendered
      .filter(({ key }) => SIDEBAR_SECTIONS.has(key))
      .map(({ key, title }) => section(key, title, true)),
  ]
  // Name and title sit above both columns, aligned with the main one: in
  // reading order (what an ATS extracts) they then come first, before the sidebar.
  const header: Content = {
    stack: [
      { text: clean(content.header.fullName), fontSize: size(24), bold: true, lineHeight: 1 },
      ...(clean(content.header.title)
        ? [
            {
              text: clean(content.header.title),
              fontSize: size(12.5),
              color: accent,
              margin: [0, space(4), 0, 0],
            } as Content,
          ]
        : []),
    ],
    margin: [SIDEBAR_WIDTH + MAIN_PADDING_LEFT, 0, MAIN_PADDING_RIGHT, space(18)],
  }
  const main: Content[] = rendered
    .filter(({ key }) => !SIDEBAR_SECTIONS.has(key))
    .map(({ key, title }) => section(key, title, false))

  const document = baseDocument(input)
  return {
    ...document,
    pageMargins: [0, space(40), 0, space(36)],
    defaultStyle: { ...document.defaultStyle, fontSize: base },
    background: () => ({
      // absolutePosition: without it, pdfmake refuses a canvas taller than the free space.
      absolutePosition: { x: 0, y: 0 },
      canvas: [
        { type: 'rect', x: 0, y: 0, w: SIDEBAR_WIDTH, h: A4.height, color: tint(accent, 0.9) },
      ],
    }),
    content: [
      header,
      {
        // Margins on nested stacks, not on the columns: pdfmake sizes a column
        // by its width and ignores its own horizontal margins.
        columns: [
          {
            width: SIDEBAR_WIDTH,
            stack: [{ stack: sidebar, margin: [SIDEBAR_PADDING, 0, SIDEBAR_PADDING, 0] }],
          },
          {
            width: '*',
            stack: [{ stack: main, margin: [MAIN_PADDING_LEFT, 0, MAIN_PADDING_RIGHT, 0] }],
          },
        ],
        columnGap: 0,
      },
    ],
  }
}
