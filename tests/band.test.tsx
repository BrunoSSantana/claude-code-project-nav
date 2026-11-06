import { expect, test } from 'claude-code/testing'

import { reasonHash } from '../src/status'
import type { Here, LiveEntry, SessionRow } from '../types'

const HERE: Here = { id: 'cli-1', root: '/home/a/dev/api-pagamentos', name: 'api-pagamentos', title: 'Migrar endpoints para v2', branch: 'feat/v2' }
const ROWS: SessionRow[] = [
  { id: 'cli-1', localId: 'local_1', title: 'Migrar endpoints para v2', branch: 'feat/v2', lastActivity: 2, status: 'idle' },
  { id: 'cli-2', localId: 'local_2', title: 'Corrigir testes de integração', branch: 'fix/tests', lastActivity: 1, status: 'idle' },
]

const BAND = {
  plugin: 'project-nav',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const live = (sessionId: string, status: LiveEntry['status'], reason?: string): LiveEntry => ({
  sessionId,
  localId: `local_${sessionId}`,
  projectPath: '/home/a/dev/dashboard-vendas',
  title: 'Gráfico de funil por região',
  status,
  reason,
  updatedAt: Date.now(),
})

type Seed = { bandOpen?: boolean; others?: LiveEntry[]; dismissed?: Record<string, string> }

// here, sessions e others são Shaped: guardados com a tag que o atom do mod nomeia
const seed =
  ({ bandOpen = false, others = [], dismissed = {} }: Seed) =>
  (_: unknown, e: { key: string }) => {
    const values: Record<string, unknown> = {
      here: { shape: 'here-1', value: HERE },
      sessions: { shape: 'sessions-1', value: ROWS },
      others: { shape: 'others-1', value: others },
      bandOpen,
      dismissed,
    }
    return { value: { value: values[e.key], version: 1 } }
  }

test('a faixa fechada mostra projeto, sessão e branch (F1)', async ($, on) => {
  on('state.get', seed({}))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Button', text: /^api-pagamentos$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', text: /^Migrar endpoints para v2 ▾$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /feat\/v2/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /SESSÕES DE/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('a faixa aberta lista as sessões do projeto e a nova sessão (F3)', async ($, on) => {
  on('state.get', seed({ bandOpen: true }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /SESSÕES DE API-PAGAMENTOS/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', text: /Corrigir testes de integração/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /atual/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'new' })).toBeTruthy()
    await ui.unmount()
  }
})

test('contadores somam só as outras sessões e somem quando zerados (F2)', async ($, on) => {
  on('state.get', seed({ others: [live('s2', 'running'), live('s3', 'running')] }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /2 rodando/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /aguardando/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('outra sessão aguardando abre o alerta com o motivo (F6)', async ($, on) => {
  on('state.get', seed({ others: [live('s2', 'waiting', 'Bash: npm run build')] }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /dashboard-vendas precisa de você/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /pede: Bash: npm run build/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /1 aguardando/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'alert-go' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'alert-later' })).toBeTruthy()
    await ui.unmount()
  }
})

test('"Depois" recolhe o alerta até o motivo mudar (F6)', async ($, on) => {
  on('state.get', seed({ others: [live('s2', 'waiting', 'Bash: ls')], dismissed: { s2: reasonHash('Bash: ls') } }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /precisa de você/ })).toBeFalsy()
  // o contador continua: a sessão ainda aguarda
  expect(await ui.find({ type: 'Text', text: /1 aguardando/ })).toBeTruthy()
  await ui.unmount()
})
