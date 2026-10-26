import type Anthropic from '@anthropic-ai/sdk'
import type { Database } from '@piston/db'

/** Mutable state read by the global stubs in ./setup.ts. Reset by `resetTestState()`. */
export const testState = {
  db: undefined as unknown as Database,
  claude: undefined as unknown as Anthropic,
  user: null as { id: string; email: string; displayName: string } | null,
  /** session_version stored in the fake session cookie. */
  sessionVersion: 0,
  config: {
    anthropicApiKey: 'test-key',
    claudeModel: 'claude-sonnet-5-5',
    databaseUrl: '',
    trustProxy: false,
    dailyGenerationLimit: 30,
    claudeGlobalDailyLimit: 300,
    claudeMonthlyBudgetUsd: 25,
    tavilyGlobalDailyLimit: 300,
    tavilyMonthlyCredits: 1000,
    tavilyApiKey: 'test-tavily-key',
  },
}
