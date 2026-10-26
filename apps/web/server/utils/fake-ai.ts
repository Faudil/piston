import type Anthropic from '@anthropic-ai/sdk'

/**
 * Deterministic stand-ins for Claude and Tavily, used ONLY by the end-to-end
 * tests (`e2e/`): the real app runs, with no API key and no network, so the
 * suite is free and repeatable. Everything around the provider (usage ledger,
 * validation, storage, streaming to the browser) still runs for real, because
 * the fakes are plugged in at the two client factory points (`useClaude` in
 * claude.ts, `tavilyRequest` in tavily.ts).
 *
 * Enabled by NUXT_E2E_FAKE_AI=1. Never set it in production: the server
 * refuses to start (see plugins/fake-ai-guard.ts) and `isFakeAi()` throws.
 */

/** True when the e2e fakes are on. Throws if that happens in a production process. */
export function isFakeAi(): boolean {
  const env = process.env // not `process.env.NODE_ENV`: the bundler would inline it at build time
  if (env.NUXT_E2E_FAKE_AI !== '1') return false
  if (env.NODE_ENV === 'production') {
    throw new Error('NUXT_E2E_FAKE_AI must never be set when NODE_ENV=production')
  }
  return true
}

// --- Canned answers (French, valid against the schemas of @piston/shared) --------

const review = {
  scores: { lisibilite: 8, impact: 6, motsCles: 7, coherence: 9 },
  ats: {
    score: 82,
    checks: [
      { criterion: 'Format du texte', status: 'ok', detail: 'Texte brut lisible.', fix: '' },
      {
        criterion: 'Intitulés de sections',
        status: 'warning',
        detail: 'Un intitulé est atypique.',
        fix: 'Utilise « Expérience professionnelle ».',
      },
    ],
    summary: 'Ton CV passe bien les filtres, avec un point à corriger.',
  },
  strengths: Array.from({ length: 5 }, (_, i) => ({
    quote: `Phrase forte numéro ${i + 1}`,
    comment: 'Concret et chiffré.',
  })),
  improvements: Array.from({ length: 5 }, (_, i) => ({
    quote: `Phrase à améliorer numéro ${i + 1}`,
    problem: 'Trop vague.',
    suggestion: 'Ajoute un résultat chiffré.',
  })),
  rewrite: [{ original: 'Gestion des réseaux sociaux', rewritten: 'Animation de 3 communautés' }],
}

const offerAnalysis = {
  matchScore: 78,
  summary: 'Ton profil correspond bien à ce poste, avec quelques mots-clés à ajouter.',
  atsMatch: {
    score: 70,
    foundKeywords: ['communication', 'réseaux sociaux'],
    missingKeywords: [{ keyword: 'SEO', suggestion: 'Mentionne tes notions de référencement.' }],
  },
  matchingSkills: [{ skill: 'Rédaction', evidence: 'Articles publiés pendant ton stage.' }],
  missingSkills: [{ skill: 'Analytics', advice: 'Suis un court module Google Analytics.' }],
  interviewQuestions: Array.from({ length: 5 }, (_, i) => ({
    question: `Question d'entretien numéro ${i + 1} ?`,
    hint: 'Appuie-toi sur ton dernier poste.',
  })),
  jargon: [
    { term: 'Growth', meaning: "Chercher à faire croître l'audience par l'expérimentation." },
  ],
}

const searchLeads = {
  jobs: Array.from({ length: 5 }, (_, i) => ({
    title: `Poste voisin ${i + 1}`,
    why: 'Ressemble à ton expérience actuelle.',
  })),
  keywords: Array.from({ length: 10 }, (_, i) => `mot-clé ${i + 1}`),
  companyTypes: Array.from({ length: 5 }, (_, i) => ({
    type: `Type d'entreprise ${i + 1}`,
    why: 'Recrute ce type de profil.',
  })),
}

const cvDraft = {
  header: {
    fullName: 'Camille Martin',
    title: 'Chargée de communication',
    email: 'camille@example.com',
    phone: '06 12 34 56 78',
    city: 'Lyon',
    links: [],
  },
  summary: 'Chargée de communication avec trois ans d’expérience en contenus et réseaux sociaux.',
  experiences: [
    {
      title: 'Chargée de communication',
      organization: 'Atelier Lumière',
      location: 'Lyon',
      start: '09/2023',
      end: "Aujourd'hui",
      bullets: ['Animation de trois communautés en ligne', 'Rédaction de la newsletter mensuelle'],
    },
  ],
  education: [
    {
      degree: 'Master Communication',
      school: 'Université Lyon 2',
      location: 'Lyon',
      start: '2020',
      end: '2022',
      details: '',
    },
  ],
  skills: [{ name: 'Outils', items: ['Figma', 'WordPress'] }],
  languages: [{ name: 'Anglais', level: 'C1' }],
  projects: [],
  certifications: [],
  interests: [],
}

const cvEdit = {
  summary: 'Je n’ai rien à changer pour le moment, ton CV est cohérent.',
  operations: [],
}

const coverLetter = [
  'Madame, Monsieur,',
  'Votre offre a retenu toute mon attention : mon parcours en communication correspond à ce que vous recherchez.',
  'Chez Atelier Lumière, j’ai animé trois communautés et rédigé une newsletter lue chaque mois par des milliers de personnes.',
  'Je serais ravie de vous rencontrer pour en discuter.',
  'Cordialement,',
].join('\n\n')

/** The paragraph a regenerated one is replaced with (the route merges it back). */
const regeneratedParagraph =
  'Mon expérience chez Atelier Lumière m’a appris à transformer une idée en contenu qui touche son public.'

const importedOffer = {
  isJobOffer: true,
  title: 'Chargé de communication',
  company: 'Entreprise Test',
  text: 'Nous recherchons un chargé de communication pour animer nos réseaux sociaux.',
}

/**
 * Picks the answer from the JSON schema the route sent (`output_config.format`):
 * each structured output has a distinctive top-level key. No schema means free
 * text (cover letter); a paragraph rewrite is told apart by the marker of its prompt.
 */
function answerFor(params: {
  system?: unknown
  output_config?: { format?: { schema?: { properties?: Record<string, unknown> } } }
}): { text: string; json?: unknown } {
  const keys = Object.keys(params.output_config?.format?.schema?.properties ?? {})
  const has = (key: string) => keys.includes(key)
  const json = has('scores')
    ? review
    : has('matchScore')
      ? offerAnalysis
      : has('jobs')
        ? searchLeads
        : has('header')
          ? cvDraft
          : has('operations')
            ? cvEdit
            : has('isJobOffer')
              ? importedOffer
              : undefined
  if (json) return { text: JSON.stringify(json), json }
  const system = JSON.stringify(params.system ?? '')
  // Only a paragraph rewrite is asked for a single paragraph.
  return { text: system.includes('[PARAGRAPH TO REWRITE]') ? regeneratedParagraph : coverLetter }
}

/** Splits text in a few chunks so the browser sees a real stream. */
function chunks(text: string, size = 400): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

const USAGE = {
  input_tokens: 1200,
  output_tokens: 600,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

/** What `useClaude().beta.messages.stream()` returns, reduced to what generation.ts uses. */
function fakeStream(params: Parameters<typeof answerFor>[0] & { model: string }) {
  const { text, json } = answerFor(params)
  const listeners: Array<(delta: string) => void> = []
  let aborted = false
  const finished = (async () => {
    // Let the caller register its 'text' listener first.
    await new Promise((resolve) => setTimeout(resolve, 20))
    for (const part of chunks(text)) {
      if (aborted) break
      for (const listener of listeners) listener(part)
      await new Promise((resolve) => setTimeout(resolve, 15))
    }
    return {
      model: params.model,
      stop_reason: 'end_turn' as const,
      usage: USAGE,
      content: [{ type: 'text' as const, text }],
      // Stands in for the SDK's validation of structured outputs (`schema` mode).
      parsed_output: json ?? null,
    }
  })()
  return {
    on(event: 'text', listener: (delta: string) => void) {
      if (event === 'text') listeners.push(listener)
    },
    finalMessage: () => finished,
    abort: () => {
      aborted = true
    },
    get aborted() {
      return aborted
    },
  }
}

/** The fake Anthropic client: only the two methods the app calls. */
export function fakeClaudeClient(): Anthropic {
  const client = {
    beta: { messages: { stream: fakeStream } },
    messages: {
      async parse(params: Parameters<typeof answerFor>[0] & { model: string }) {
        const { text, json } = answerFor(params)
        return {
          model: params.model,
          usage: USAGE,
          content: [{ type: 'text', text }],
          parsed_output: json,
        }
      },
    },
  }
  return client as unknown as Anthropic
}

/** Canned Tavily responses (same shape as the real API) for /search and /extract. */
export function fakeTavilyResponse(path: '/search' | '/extract') {
  if (path === '/extract') {
    return {
      usage: { credits: 1 },
      results: [
        {
          url: 'https://www.welcometothejungle.com/fr/offre-test',
          raw_content:
            '# Chargé de communication\n\nEntreprise Test recrute pour animer ses réseaux sociaux.',
        },
      ],
    }
  }
  return {
    usage: { credits: 1 },
    results: [
      {
        title: 'Chargé de communication H/F - Entreprise Test',
        url: 'https://www.welcometothejungle.com/fr/offre-test',
        content: 'Entreprise Test recherche un chargé de communication à Lyon. CDI.',
        published_date: '2026-10-20',
      },
    ],
  }
}
