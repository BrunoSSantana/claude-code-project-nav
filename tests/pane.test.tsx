import { expect, test } from 'claude-code/testing'

import type { Here, ProjectRow, Projects } from '../types'

const HERE: Here = { id: 'cli-1', root: '/w/project-mods', name: 'project-mods', title: 'Painel', branch: undefined }

const session = (id: string, lastActivity: number) => ({
  id,
  localId: `local_${id}`,
  title: `sessão ${id}`,
  lastActivity,
  status: 'idle' as const,
})

const project = (path: string, name: string, extra: Partial<ProjectRow> = {}): ProjectRow => ({
  path,
  name,
  status: 'idle',
  lastActivity: 1,
  sessionCount: 1,
  runningCount: 0,
  sessions: [session(`${name}-1`, 1)],
  ...extra,
})

const PROJECTS: Projects = {
  current: '/w/project-mods',
  list: [
    project('/w/work/checkout-web', 'Storefront', { status: 'waiting' }),
    project('/w/project-mods', 'project-mods', {
      sessionCount: 7,
      sessions: [session('cli-1', 9), session('cli-2', 8)],
    }),
    project('/w/job', 'Job'),
  ],
}

const PANE = {
  plugin: 'project-nav',
  component: 'Pane',
  requestId: 'project-nav',
  props: {
    title: 'Projetos',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

type Seed = { pins?: Record<string, boolean>; query?: string; filter?: string }

const seed =
  ({ pins = {}, query = '', filter = 'all' }: Seed) =>
  (_: unknown, e: { key: string }) => {
    const value =
      e.key === 'here'
        ? { shape: 'here-1', value: HERE }
        : e.key === 'projects'
          ? { shape: 'projects-1', value: PROJECTS }
          : e.key === 'pins'
            ? pins
            : e.key === 'query'
              ? query
              : e.key === 'filter'
                ? filter
                : {}
    return { value: { value, version: 1 } }
  }

test('o painel lista os projetos por seção, com o atual aberto (F8 a F10)', async ($, on) => {
  on('state.get', seed({ pins: { '/w/job': true } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /3 projetos no total/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /PROJETO ATUAL/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /FIXADOS/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /TODOS OS OUTROS/ })).toBeTruthy()
    // no Desktop o nome é Text em negrito com o clique por cima; no terminal, o próprio Button
    expect(await ui.find({ type: surface === 'desktop' ? 'Text' : 'Button', text: /^Storefront$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'name-/w/work/checkout-web' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Aguardando sua permissão/ })).toBeTruthy()
    // projeto atual aberto: esta sessão sem clique, a outra clicável
    expect(await ui.find({ type: 'Text', text: /esta sessão/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'go-cli-2' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'go-cli-1' })).toBeFalsy()
    // no Desktop um só Button em branco, recortado sobre a pílula "Abrir" (que é desenho)
    if (surface === 'desktop') {
      expect(await ui.find({ type: 'Button', key: 'go-cli-2-1' })).toBeFalsy()
      expect(await ui.find({ type: 'Button', key: 'open-cli-2' })).toBeFalsy()
    }
    expect(await ui.find({ type: 'Text', text: /\+ 5 na barra lateral/ })).toBeTruthy()
    // os outros ficam fechados
    expect(await ui.find({ type: 'Button', key: 'go-Job-1' })).toBeFalsy()
    expect(await ui.find({ type: 'Button', key: 'chev-/w/job' })).toBeTruthy()
    await ui.unmount()
  }
})

test('sem leitura ainda, o painel avisa', async ($, on) => {
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Lendo os projetos/ })).toBeTruthy()
  await ui.unmount()
})

test('filtros mostram contagens e combinam com a busca (F12, F13)', async ($, on) => {
  on('state.get', seed({ filter: 'waiting' }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // terminal: o rótulo do Button; Desktop: a pílula desenhada por baixo do Button em branco
    if (surface === 'desktop') {
      expect(await ui.find({ type: 'Button', key: 'filter-all' })).toBeTruthy()
      expect(await ui.find({ type: 'Text', text: /^Aguardando$/ })).toBeTruthy()
      expect(await ui.find({ type: 'Text', text: /^Parados$/ })).toBeTruthy()
    } else {
      expect(await ui.find({ type: 'Button', text: /^Todos 3$/ })).toBeTruthy()
      expect(await ui.find({ type: 'Button', text: /^Aguardando 1$/ })).toBeTruthy()
      expect(await ui.find({ type: 'Button', text: /^Parados 2$/ })).toBeTruthy()
    }
    // filtro ativo: só Storefront, em "Resultados"
    expect(await ui.find({ type: 'Text', text: /RESULTADOS/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'name-/w/work/checkout-web' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'name-/w/job' })).toBeFalsy()
    await ui.unmount()
  }
})

test('sem resultado, o painel oferece limpar filtros (F14)', async ($, on) => {
  on('state.get', seed({ query: 'nada-bate' }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Nenhum projeto com esse filtro/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'clear' })).toBeTruthy()
  await ui.unmount()
})

test('o alfinete mostra quem está fixado (F11)', async ($, on) => {
  on('state.get', seed({ pins: { '/w/job': true } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const pinned = JSON.stringify(await ui.find({ type: 'Button', key: 'pin-/w/job' }))
    const loose = JSON.stringify(await ui.find({ type: 'Button', key: 'pin-/w/work/checkout-web' }))
    // Desktop: alfinete em Svg (alt diz o estado) com o Button em branco por cima; terminal: ★ e ☆
    if (surface === 'desktop') {
      expect(pinned).not.toContain('Fixa')
      expect(loose).not.toContain('Fixa')
    } else {
      expect(pinned).toContain('★')
      expect(loose).toContain('☆')
    }
    await ui.unmount()
  }
})

test('no Desktop o Button sobreposto não desenha texto visível', async ($, on) => {
  on('state.get', seed({}))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (const key of ['filter-all', 'name-/w/job', 'go-cli-2', 'pin-/w/job']) {
    const button = JSON.stringify(await ui.find({ type: 'Button', key }))
    expect(button).not.toMatch(/Todos|Job|Abrir|Fixar/)
  }
  await ui.unmount()
})
