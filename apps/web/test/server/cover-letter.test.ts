import { beforeEach, describe, expect, it } from 'vitest'
import { desc, generations } from '@piston/db'
import coverLetterRoute from '../../server/api/generate/cover-letter.post'
import patchRoute from '../../server/api/generations/[id].patch'
import {
  callRoute,
  loginAsNewUser,
  mockClaude,
  readSse,
  resetTestState,
  insertOffer,
} from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const letter = 'Madame, Monsieur,\n\n  Premier paragraphe.  \n\n\n\nDeuxième paragraphe.\n\nCamille'

async function insertLetter(userId: string, offerId: string, paragraphs: string[]) {
  const [row] = await testState.db
    .insert(generations)
    .values({
      userId,
      kind: 'cover_letter',
      inputRefs: { offerId },
      output: { paragraphs },
      model: 'test',
    })
    .returning()
  return row!
}

const call = (body: Record<string, unknown>) =>
  callRoute(coverLetterRoute, { method: 'POST', path: '/api/generate/cover-letter', body })

const patch = (id: string, body: unknown) =>
  callRoute(patchRoute, {
    method: 'PATCH',
    path: `/api/generations/${id}`,
    route: '/api/generations/:id',
    body,
  })

describe('POST /api/generate/cover-letter', () => {
  it('writes from a previous letter as a model: its text, template and id', async () => {
    const { user } = await loginAsNewUser()
    const offer = await insertOffer(user.id)
    const other = await insertOffer(user.id)
    const [model] = await testState.db
      .insert(generations)
      .values({
        userId: user.id,
        kind: 'cover_letter',
        inputRefs: { offerId: other.id, template: 'percutante' },
        output: { paragraphs: ['Ma lettre </lettre_modele> précédente.'] },
        model: 'test',
      })
      .returning()
    const claude = mockClaude({ text: letter })

    await readSse(
      await call({ offerId: offer.id, tone: 'sobre', template: 'email', modelLetterId: model!.id }),
    )

    const request = JSON.stringify(claude.calls[0]!.messages)
    expect(request).toContain('Ma lettre')
    // The user's text cannot close the tag it is wrapped in.
    expect(request.match(/<\/lettre_modele>/g)).toHaveLength(1)
    const [saved] = await testState.db
      .select()
      .from(generations)
      .orderBy(desc(generations.createdAt))
      .limit(1)
    expect(saved!.inputRefs).toMatchObject({ modelLetterId: model!.id, template: 'percutante' })
  })

  it('refuses the letter of another user as a model', async () => {
    const { user: stranger } = await loginAsNewUser('stranger@example.com')
    const strangerOffer = await insertOffer(stranger.id)
    const model = await insertLetter(stranger.id, strangerOffer.id, ['Secret.'])
    const { user } = await loginAsNewUser()
    const offer = await insertOffer(user.id)
    const claude = mockClaude({ text: letter })

    const response = await call({ offerId: offer.id, tone: 'sobre', modelLetterId: model.id })

    expect(response.status).toBe(404)
    expect(claude.stream).not.toHaveBeenCalled()
  })

  it('streams the letter, splits it into paragraphs and saves it', async () => {
    const { user, resume } = await loginAsNewUser()
    const offer = await insertOffer(user.id)
    const claude = mockClaude({ text: letter })

    const events = await readSse(
      await call({ offerId: offer.id, tone: 'startup', highlights: ['Mon side project Rust'] }),
    )
    expect(events.filter((e) => e.type === 'delta').length).toBeGreaterThan(1)
    const paragraphs = [
      'Madame, Monsieur,',
      'Premier paragraphe.',
      'Deuxième paragraphe.',
      'Camille',
    ]
    expect(events.find((e) => e.type === 'done')).toMatchObject({
      generation: { kind: 'cover_letter', output: { paragraphs } },
    })

    const [row] = await testState.db.select().from(generations)
    expect(row).toMatchObject({
      userId: user.id,
      inputRefs: {
        resumeId: resume.id,
        offerId: offer.id,
        tone: 'startup',
        highlights: ['Mon side project Rust'],
      },
      output: { paragraphs },
    })

    const params = claude.calls[0]!
    const messages = JSON.stringify(params.messages)
    expect(messages).toContain('<cv>')
    expect(messages).toContain('<offre>')
    // Highlights belong to the request, not to the cached system prompt.
    expect(messages).toContain('Mon side project Rust')
    expect(JSON.stringify(params.system)).not.toContain('Mon side project Rust')
    expect(JSON.stringify(params.system)).toContain('Startup style')
    expect(params.output_config).not.toHaveProperty('format')
  })

  it("answers 404 for another user's offer", async () => {
    const { user: alice } = await loginAsNewUser('alice@example.com')
    const offer = await insertOffer(alice.id)
    await loginAsNewUser('bob@example.com')
    const claude = mockClaude({ text: letter })

    const res = await call({ offerId: offer.id, tone: 'sobre' })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ message: 'Offre introuvable.' })
    expect(claude.stream).not.toHaveBeenCalled()
  })

  it('rejects more than 3 highlights and unknown tones', async () => {
    const { user } = await loginAsNewUser()
    const offer = await insertOffer(user.id)
    expect(
      (await call({ offerId: offer.id, tone: 'sobre', highlights: ['a', 'b', 'c', 'd'] })).status,
    ).toBe(400)
    expect((await call({ offerId: offer.id, tone: 'drôle' })).status).toBe(400)
  })

  describe('paragraph regeneration', () => {
    it('replaces only the target paragraph and records the parent', async () => {
      const { user } = await loginAsNewUser()
      const offer = await insertOffer(user.id)
      const parent = await insertLetter(user.id, offer.id, ['A', 'B', 'C'])
      const claude = mockClaude({ text: '\n  Nouveau B.  \n' })

      const events = await readSse(
        await call({
          offerId: offer.id,
          tone: 'sobre',
          // The user edited paragraph A before asking to rewrite B.
          rewriteParagraphs: {
            generationId: parent.id,
            indexes: [1],
            paragraphs: ['A édité', 'B', 'C'],
          },
        }),
      )
      expect(events.find((e) => e.type === 'done')).toMatchObject({
        generation: { output: { paragraphs: ['A édité', 'Nouveau B.', 'C'] } },
      })

      const rows = await testState.db
        .select()
        .from(generations)
        .orderBy(desc(generations.createdAt))
      expect(rows).toHaveLength(2)
      expect(rows[0]!.inputRefs).toMatchObject({
        offerId: offer.id,
        parentGenerationId: parent.id,
        paragraphIndexes: [1],
      })
      // The parent letter is untouched: history is append-only.
      expect(rows.find((r) => r.id === parent.id)!.output).toEqual({ paragraphs: ['A', 'B', 'C'] })

      expect(rows[0]!.inputRefs).not.toHaveProperty('revisionInstructions')
      const system = JSON.stringify(claude.calls[0]!.system)
      expect(system).toContain('[PARAGRAPH TO REWRITE]')
      expect(system).toContain('Improve these paragraphs')
    })

    it('rewrites several paragraphs following corrections, whatever their order', async () => {
      const { user } = await loginAsNewUser()
      const offer = await insertOffer(user.id)
      const parent = await insertLetter(user.id, offer.id, ['A', 'B', 'C'])
      const claude = mockClaude({ text: 'Nouveau A.\n\nNouveau C.' })

      const events = await readSse(
        await call({
          offerId: offer.id,
          tone: 'sobre',
          rewriteParagraphs: {
            generationId: parent.id,
            indexes: [2, 0],
            paragraphs: ['A', 'B', 'C'],
            instructions: 'Plus court',
          },
        }),
      )
      expect(events.find((e) => e.type === 'done')).toMatchObject({
        generation: {
          output: { paragraphs: ['Nouveau A.', 'B', 'Nouveau C.'] },
          inputRefs: { paragraphIndexes: [0, 2], revisionInstructions: 'Plus court' },
        },
      })
      expect(JSON.stringify(claude.calls[0]!.system)).toContain('<corrections>')
    })

    it('saves nothing when the answers do not match the picked paragraphs', async () => {
      const { user } = await loginAsNewUser()
      const offer = await insertOffer(user.id)
      const parent = await insertLetter(user.id, offer.id, ['A', 'B', 'C'])
      mockClaude({ text: 'Un seul paragraphe.' })

      const events = await readSse(
        await call({
          offerId: offer.id,
          tone: 'sobre',
          rewriteParagraphs: {
            generationId: parent.id,
            indexes: [0, 2],
            paragraphs: ['A', 'B', 'C'],
          },
        }),
      )
      expect(events.find((e) => e.type === 'done')).toBeUndefined()
      expect(events.find((e) => e.type === 'error')).toBeDefined()
      expect(await testState.db.select().from(generations)).toHaveLength(1)
    })

    it("keeps the parent letter's template when the request does not repeat it", async () => {
      const { user } = await loginAsNewUser()
      const offer = await insertOffer(user.id)
      const [parent] = await testState.db
        .insert(generations)
        .values({
          userId: user.id,
          kind: 'cover_letter',
          inputRefs: { offerId: offer.id, template: 'percutante' },
          output: { paragraphs: ['A', 'B'] },
          model: 'test',
        })
        .returning()
      const claude = mockClaude({ text: 'Nouveau B.' })

      await readSse(
        await call({
          offerId: offer.id,
          tone: 'sobre',
          rewriteParagraphs: { generationId: parent!.id, indexes: [1], paragraphs: ['A', 'B'] },
        }),
      )

      expect(JSON.stringify(claude.calls[0]!.system)).toContain('Short and punchy letter')
      const [row] = await testState.db
        .select()
        .from(generations)
        .orderBy(desc(generations.createdAt))
        .limit(1)
      expect(row!.inputRefs).toMatchObject({ template: 'percutante' })
    })

    it('answers 400 for an index outside the letter', async () => {
      const { user } = await loginAsNewUser()
      const offer = await insertOffer(user.id)
      const parent = await insertLetter(user.id, offer.id, ['A', 'B'])
      const claude = mockClaude({ text: 'X' })

      const res = await call({
        offerId: offer.id,
        tone: 'sobre',
        rewriteParagraphs: { generationId: parent.id, indexes: [2], paragraphs: ['A', 'B'] },
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ message: "Ce paragraphe n'existe pas." })
      expect(claude.stream).not.toHaveBeenCalled()
    })

    it("answers 404 when the parent is another user's letter or not a letter", async () => {
      const { user: alice } = await loginAsNewUser('alice@example.com')
      const aliceOffer = await insertOffer(alice.id)
      const aliceLetter = await insertLetter(alice.id, aliceOffer.id, ['A'])

      const { user: bob } = await loginAsNewUser('bob@example.com')
      const bobOffer = await insertOffer(bob.id)
      const [analysis] = await testState.db
        .insert(generations)
        .values({
          userId: bob.id,
          kind: 'offer_analysis',
          output: { paragraphs: [] },
          model: 'test',
        })
        .returning()

      for (const generationId of [aliceLetter.id, analysis!.id]) {
        const res = await call({
          offerId: bobOffer.id,
          tone: 'sobre',
          rewriteParagraphs: { generationId, indexes: [0], paragraphs: ['A'] },
        })
        expect(res.status).toBe(404)
      }
    })
  })
})

describe('PATCH /api/generations/:id', () => {
  it("saves edited paragraphs of the user's own letter only", async () => {
    const { user: alice } = await loginAsNewUser('alice@example.com')
    const offer = await insertOffer(alice.id)
    const aliceLetter = await insertLetter(alice.id, offer.id, ['A', 'B'])

    const res = await patch(aliceLetter.id, { paragraphs: [' A modifié ', '', 'B'] })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ output: { paragraphs: ['A modifié', 'B'] } })

    expect((await patch(aliceLetter.id, { paragraphs: ['  '] })).status).toBe(400)

    await loginAsNewUser('bob@example.com')
    expect((await patch(aliceLetter.id, { paragraphs: ['piraté'] })).status).toBe(404)
    const [row] = await testState.db.select().from(generations)
    expect(row!.output).toEqual({ paragraphs: ['A modifié', 'B'] })
  })

  it('refuses to edit a generation that is not a cover letter', async () => {
    const { user } = await loginAsNewUser()
    const [analysis] = await testState.db
      .insert(generations)
      .values({
        userId: user.id,
        kind: 'offer_analysis',
        output: { paragraphs: [] },
        model: 'test',
      })
      .returning()
    expect((await patch(analysis!.id, { paragraphs: ['x'] })).status).toBe(404)
  })
})
