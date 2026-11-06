import { expect, test } from 'claude-code/testing'

import {
  autocompleteFor,
  avatarColor,
  filterProjects,
  encodeProject,
  githubRepoName,
  groupProjects,
  initials,
  mergeSessions,
  paneSections,
  pickTitle,
  projectLabel,
  projectStatusLine,
  relativeTime,
  sidebarScope,
  sortSessions,
  statusCounts,
} from '../src/model'
import type { DesktopSession } from '../src/model'
import type { ProjectRow, SessionRow } from '../types'

test('encodeProject troca todo caractere não alfanumérico por hífen', async () => {
  expect(encodeProject('/home/a/www/study/project-mods')).toBe('-home-a-www-study-project-mods')
  expect(encodeProject('/home/a/.claude/x_y')).toBe('-home-a--claude-x-y')
})

test('initials pega duas palavras, ou as duas primeiras letras', async () => {
  expect(initials('api-pagamentos')).toBe('AP')
  expect(initials('lib-ui-components')).toBe('LU')
  expect(initials('scripts')).toBe('SC')
  expect(initials('x')).toBe('X ')
})

test('avatarColor é estável por caminho', async () => {
  expect(avatarColor('/home/a/dev/api')).toBe(avatarColor('/home/a/dev/api'))
  expect(avatarColor('/home/a/dev/api')).toMatch(/^#[0-9A-F]{6}$/)
})

test('pickTitle prefere o resumo e corta o primeiro prompt em palavra', async () => {
  expect(pickTitle({ summary: '  Migrar endpoints ', firstPrompt: 'outro' })).toBe('Migrar endpoints')
  expect(pickTitle({ firstPrompt: 'corrigir   testes\nde integração' })).toBe('corrigir testes de integração')
  const long = pickTitle({ firstPrompt: 'palavra '.repeat(20) })
  expect(long.endsWith('…')).toBe(true)
  expect(long.length).toBeLessThanOrEqual(61)
  expect(pickTitle({})).toBe('Sessão sem título')
})

test('relativeTime segue os rótulos do protótipo', async () => {
  const now = new Date(2026, 9, 29, 15, 0).getTime()
  expect(relativeTime(now - 10_000, now)).toBe('agora')
  expect(relativeTime(now - 40 * 60_000, now)).toBe('há 40 min')
  expect(relativeTime(new Date(2026, 9, 29, 10, 42).getTime(), now)).toBe('hoje 10:42')
  expect(relativeTime(new Date(2026, 9, 28, 23, 0).getTime(), now)).toBe('ontem')
  expect(relativeTime(new Date(2026, 9, 26, 9, 0).getTime(), now)).toBe('segunda')
  expect(relativeTime(new Date(2026, 9, 8, 9, 0).getTime(), now)).toBe('08/10')
})

test('sortSessions: aguardando, rodando, depois mais recente', async () => {
  const row = (id: string, status: SessionRow['status'], lastActivity: number): SessionRow => ({
    id,
    title: id,
    status,
    lastActivity,
  })
  const sorted = sortSessions([row('a', 'idle', 5), row('b', 'running', 1), row('c', 'idle', 9), row('d', 'waiting', 0)])
  expect(sorted.map(r => r.id)).toEqual(['d', 'b', 'c', 'a'])
})

test('mergeSessions usa o título e o id do Desktop quando existem', async () => {
  const rows = mergeSessions(
    [
      { id: 'cli-1', lastActivity: 10, summary: 'título do cli', branch: 'feat/v2' },
      { id: 'cli-2', lastActivity: 20, firstPrompt: 'só o prompt', branch: 'HEAD' },
    ],
    [{ localId: 'local_1', cliId: 'cli-1', title: 'título do app', cwd: '/p', lastActivity: 30, dir: '/org' }],
  )
  expect(rows[0]).toEqual({
    id: 'cli-1',
    localId: 'local_1',
    title: 'título do app',
    branch: 'feat/v2',
    lastActivity: 30,
    status: 'idle',
  })
  expect(rows[1]?.title).toBe('só o prompt')
  expect(rows[1]?.branch).toBeUndefined()
  expect(rows[1]?.localId).toBeUndefined()
})

const desk = (cliId: string, cwd: string, lastActivity: number, extra: Partial<DesktopSession> = {}): DesktopSession => ({
  localId: `local_${cliId}`,
  cliId,
  title: `sessão ${cliId}`,
  cwd,
  lastActivity,
  dir: '/sessions/conta/org',
  ...extra,
})

test('githubRepoName segue o parser do Desktop: só github.com', async () => {
  expect(githubRepoName('https://github.com/acme/Storefront.git')).toBe('Storefront')
  expect(githubRepoName('git@github.com:acme/webapp.git')).toBe('webapp')
  expect(githubRepoName('ssh://git@github.com:22/acme/webapp/')).toBe('webapp')
  expect(githubRepoName('git@ssh.dev.azure.com:v3/org/project/billing-api')).toBeUndefined()
  expect(githubRepoName('https://gitlab.com/a/b.git')).toBeUndefined()
  expect(githubRepoName('')).toBeUndefined()
  expect(githubRepoName(undefined)).toBeUndefined()
})

test('projectLabel usa o repo do GitHub e cai no nome da pasta', async () => {
  expect(projectLabel('/home/a/work/checkout-web', 'https://github.com/x/Storefront.git')).toBe('Storefront')
  expect(projectLabel('/home/a/work/billing-api', 'git@ssh.dev.azure.com:v3/o/p/billing-api')).toBe('billing-api')
  expect(projectLabel('/home/a', '')).toBe('a')
})

test('sidebarScope fica na pasta da sessão atual, ou na mais recente', async () => {
  const mine = desk('me', '/p', 1, { dir: '/conta-a/org' })
  const old = desk('old', '/q', 9, { dir: '/conta-b/org' })
  const same = desk('same', '/r', 2, { dir: '/conta-a/org' })
  expect(sidebarScope([mine, old, same], 'me').map(s => s.cliId)).toEqual(['me', 'same'])
  expect(sidebarScope([mine, old, same], 'terminal').map(s => s.cliId)).toEqual(['old'])
  expect(sidebarScope([], 'me')).toEqual([])
})

test('groupProjects agrupa por originCwd e junta worktrees ao repo', async () => {
  // cwd já é originCwd || cwd: a sessão em worktree chega com a raiz do repo
  const projects = groupProjects(
    [desk('a', '/w/repo', 10), desk('b', '/w/repo', 30), desk('c', '/w/checkout-web', 20), desk('d', '', 99)],
    { '/w/checkout-web': 'Storefront' },
  )
  expect(projects.map(p => [p.name, p.sessionCount, p.lastActivity])).toEqual([
    ['repo', 2, 30],
    ['Storefront', 1, 20],
  ])
  expect(projects[0]?.sessions.map(s => s.id)).toEqual(['b', 'a'])
  expect(projects[0]?.sessions[0]).toEqual({
    id: 'b',
    localId: 'local_b',
    title: 'sessão b',
    lastActivity: 30,
    status: 'idle',
  })
})

test('groupProjects mostra até 5 sessões, mas conta todas (F10)', async () => {
  const many = Array.from({ length: 7 }, (_, i) => desk(`s${i}`, '/p', i))
  const [project] = groupProjects(many)
  expect(project?.sessionCount).toBe(7)
  expect(project?.sessions.map(s => s.id)).toEqual(['s6', 's5', 's4', 's3', 's2'])
})

test('groupProjects ordena por F15: aguardando, rodando, mais recente', async () => {
  const projects = groupProjects(
    [desk('old', '/old', 1), desk('new', '/new', 50), desk('run', '/run', 5), desk('wait', '/wait', 2)],
    {},
    { run: 'running', wait: 'waiting' },
  )
  expect(projects.map(p => p.name)).toEqual(['wait', 'run', 'new', 'old'])
  expect(projects[1]?.runningCount).toBe(1)
})

test('paneSections: atual, fixados, todos os outros (F8)', async () => {
  const projects = groupProjects([desk('a', '/a', 3), desk('b', '/b', 2), desk('c', '/c', 1)])
  const sections = paneSections(projects, '/b', { '/c': true, '/b': true })
  expect(sections.map(s => [s.label, s.projects.map(p => p.name)])).toEqual([
    ['Projeto atual', ['b']],
    ['Fixados', ['c']],
    ['Todos os outros', ['a']],
  ])
  expect(paneSections(projects, '/fora', {}).map(s => s.label)).toEqual(['Todos os outros'])
})

test('projectStatusLine segue F9', async () => {
  const now = new Date(2026, 9, 29, 15, 0).getTime()
  const base: ProjectRow = {
    path: '/p',
    name: 'p',
    status: 'idle',
    lastActivity: new Date(2026, 9, 28, 9, 0).getTime(),
    sessionCount: 1,
    runningCount: 0,
    sessions: [],
  }
  expect(projectStatusLine(base, now)).toBe('Última atividade ontem')
  expect(projectStatusLine({ ...base, status: 'running', runningCount: 1 }, now)).toBe('1 sessão rodando')
  expect(projectStatusLine({ ...base, status: 'running', runningCount: 2 }, now)).toBe('2 sessões rodando')
  expect(projectStatusLine({ ...base, status: 'waiting', runningCount: 1 }, now)).toBe('Aguardando sua permissão')
})

test('filterProjects combina busca (nome ou caminho) e status (F12, F13)', async () => {
  const projects = groupProjects([desk('a', '/w/api-pag', 3), desk('b', '/w/site', 2)], {}, { a: 'running' })
  expect(filterProjects(projects, 'PAG', 'all').map(p => p.name)).toEqual(['api-pag'])
  expect(filterProjects(projects, '/w/', 'idle').map(p => p.name)).toEqual(['site'])
  expect(filterProjects(projects, '', 'waiting')).toEqual([])
  expect(statusCounts(projects)).toEqual({ all: 2, waiting: 0, running: 1, idle: 1 })
})

test('paneSections troca "Todos os outros" por "Resultados" com filtro', async () => {
  const projects = groupProjects([desk('a', '/a', 3), desk('b', '/b', 2)])
  expect(paneSections(projects, '/a', {}, true).map(s => s.label)).toEqual(['Projeto atual', 'Resultados'])
})

test('autocompleteFor sugere projetos e sessões que batem com o termo (F16)', async () => {
  const now = Date.now()
  const projects = groupProjects([
    desk('a', '/w/api-pagamentos', now, { title: 'Migrar endpoints' }),
    desk('b', '/w/app-mobile', now, { title: 'Tela de pagamento' }),
  ])
  const found = autocompleteFor({ current: '/w/api-pagamentos', list: projects }, 'pag', now)
  expect(found.map(s => [s.text, s.label])).toEqual([
    ['api-pagamentos', 'api-pagamentos'],
    ['app-mobile', 'Tela de pagamento'],
  ])
  expect(found[0]?.description).toBe('projeto atual')
  expect(autocompleteFor({ current: '', list: projects }, '  ', now)).toEqual([])
})
