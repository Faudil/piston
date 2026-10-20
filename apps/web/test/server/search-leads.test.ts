import { beforeEach, describe, expect, it } from 'vitest'
import { generations, resumes } from '@piston/db'
import type { SearchLeadsOutput } from '@piston/shared'
import searchLeadsRoute from '../../server/api/generate/search-leads.post'
import { callRoute, loginAsNewUser, mockClaude, readSse, resetTestState } from './helpers'
import { testState } from './state'

beforeEach(resetTestState)

const output: SearchLeadsOutput = {
  jobs: [{ title: 'Product owner', why: 'Tu as piloté des projets.' }],
  keywords: ['react', 'vue'],
  companyTypes: [{ type: 'Scale-up', why: 'Environnement rapide.' }],
}

const call = () =>
  callRoute(searchLeadsRoute, {
    method: 'POST',
    path: '/api/generate/search-leads',
    body: {},
  })

describe('POST /api/generate/search-leads', () => {
  it('streams the result and saves it', async () => {
    const { user, resume } = await loginAsNewUser()
    const claude = mockClaude({ text: JSON.stringify(output), parsed: output })

    const events = await readSse(await call())
    expect(events.some((e) => e.type === 'delta')).toBe(true)
    const done = events.find((e) => e.type === 'done')
    expect(done).toMatchObject({ generation: { kind: 'search_leads', output } })

    const rows = await testState.db.select().from(generations)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: user.id,
      kind: 'search_leads',
      inputRefs: { resumeId: resume.id },
      inputTokens: 1000,
      outputTokens: 50,
    })

    const params = claude.calls[0]!
    expect(params.model).toBe(testState.config.claudeModel)
    expect(JSON.stringify(params.system)).toContain('Camille')
    expect(JSON.stringify(params.messages)).toContain('cache_control')
  })

  it('answers 400 when the user has no resume', async () => {
    await loginAsNewUser()
    await testState.db.delete(resumes)
    const claude = mockClaude({ text: '{}', parsed: output })

    const res = await call()
    expect(res.status).toBe(400)
    expect(claude.stream).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    expect((await call()).status).toBe(401)
  })
})
