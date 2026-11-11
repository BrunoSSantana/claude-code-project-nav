// Funções puras: sem `$`, testadas em tests/model.test.ts.

import type { ProjectRow, Projects, SessionRow, Status, StatusFilter } from '../types'

export const PANE = 'project-nav'

export const STATUS_COLOR = {
  waiting: '#E8915F',
  running: '#7AB0FF',
  idle: '#5C5C64',
} as const

const UNTITLED = 'Sessão sem título'

// Nome da pasta em ~/.claude/projects: todo caractere não alfanumérico vira `-`.
export const encodeProject = (path: string) => path.replace(/[^A-Za-z0-9]/g, '-')

export const projectName = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

// Duas iniciais: das duas primeiras palavras do nome, ou as duas primeiras letras.
export const initials = (name: string) => {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const picked = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? name).slice(0, 2)
  return picked.toUpperCase().padEnd(2, ' ')
}

// Paleta pastel do protótipo; a cor sai de um hash do caminho, estável por projeto.
const AVATAR_COLORS = ['#F2B48C', '#A8DCC0', '#9CC3FF', '#C9B6F2', '#F2C9E0', '#B8E0E8', '#E8D49A', '#D9C2A6']

export const avatarColor = (path: string) => {
  let hash = 0
  for (const char of path) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!
}

// F1: resumo da sessão; sem ele, as primeiras palavras do primeiro prompt.
export const pickTitle = (candidates: { summary?: string; firstPrompt?: string }) => {
  const summary = candidates.summary?.trim()
  if (summary) return summary
  const prompt = candidates.firstPrompt?.replace(/\s+/g, ' ').trim()
  if (!prompt) return UNTITLED
  if (prompt.length <= 60) return prompt
  const cut = prompt.slice(0, 60)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 30 ? cut.slice(0, lastSpace) : cut}…`
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const pad = (n: number) => String(n).padStart(2, '0')
const startOfDay = (ms: number) => {
  const day = new Date(ms)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

// Última atividade como no protótipo: "agora", "há 40 min", "hoje 10:42", "ontem", "segunda", "24/10".
export const relativeTime = (ms: number, now: number) => {
  const diff = now - ms
  if (diff < 60_000) return 'agora'
  if (diff < 60 * 60_000) return `há ${Math.floor(diff / 60_000)} min`
  const at = new Date(ms)
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000)
  if (days <= 0) return `hoje ${pad(at.getHours())}:${pad(at.getMinutes())}`
  if (days === 1) return 'ontem'
  if (days < 7) return WEEKDAYS[at.getDay()]!
  return `${pad(at.getDate())}/${pad(at.getMonth() + 1)}`
}

// F15 aplicada às sessões: aguardando, rodando, depois mais recente primeiro.
const RANK = { waiting: 0, running: 1, idle: 2 } as const

export const sortSessions = (rows: readonly SessionRow[]) =>
  [...rows].sort((a, b) => RANK[a.status] - RANK[b.status] || b.lastActivity - a.lastActivity)

// Une as sessões do CLI (.jsonl) com as do Desktop (local_*.json) pelo id do CLI.
export type CliSession = { id: string; lastActivity: number; summary?: string; firstPrompt?: string; branch?: string }
// cwd é originCwd || cwd, a chave do projeto na barra do Desktop; dir é a pasta <conta>/<org> do arquivo.
export type DesktopSession = {
  localId: string
  cliId: string
  title: string
  cwd: string
  lastActivity: number
  dir: string
}

export const mergeSessions = (cli: readonly CliSession[], desk: readonly DesktopSession[]): SessionRow[] => {
  const byCli = new Map(desk.map(d => [d.cliId, d]))
  return cli.map(c => {
    const d = byCli.get(c.id)
    return {
      id: c.id,
      localId: d?.localId,
      title: pickTitle({ summary: d?.title || c.summary, firstPrompt: c.firstPrompt }),
      branch: c.branch && c.branch !== 'HEAD' ? c.branch : undefined,
      lastActivity: Math.max(c.lastActivity, d?.lastActivity ?? 0),
      status: 'idle',
    }
  })
}

// Projetos da barra lateral do Desktop. Regra em docs/SPEC.md, "Projects: the Desktop rule".

export const PANE_SESSIONS = 5

// O nome que o Desktop dá a um repo: só para origin no github.com, com o parser do app.
const SCP_REMOTE = /^[^@/:#?\s]+@([^:\s]+):([^/\s]+)\/([^/\s]+?)(?:\.git)?$/
const URL_REMOTE =
  /^(?:https?|ssh|git|git\+ssh|ssh\+git|git\+https?):\/\/(?:[^@/#?\s]+@)?([^/:\s]+)(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/

export const githubRepoName = (remote: string | undefined) => {
  const url = remote?.trim() ?? ''
  const match = url.match(SCP_REMOTE) ?? url.match(URL_REMOTE)
  return match && match[1]!.toLowerCase() === 'github.com' ? match[3] : undefined
}

export const projectLabel = (path: string, remote?: string) => githubRepoName(remote) ?? projectName(path)

// As sessões da conta e organização que o Desktop mostra: a pasta da sessão atual; sem
// ela (sessão de terminal), a pasta da sessão mais recente.
export const sidebarScope = (sessions: readonly DesktopSession[], cliId: string) => {
  const dir =
    sessions.find(s => s.cliId === cliId)?.dir ??
    [...sessions].sort((a, b) => b.lastActivity - a.lastActivity)[0]?.dir
  return sessions.filter(s => s.dir === dir)
}

const bestStatus = (rows: readonly SessionRow[]): Status =>
  rows.reduce<Status>((best, row) => (RANK[row.status] < RANK[best] ? row.status : best), 'idle')

// F15: aguardando, rodando, depois última atividade, mais recente primeiro.
export const sortProjects = (rows: readonly ProjectRow[]) =>
  [...rows].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || b.lastActivity - a.lastActivity || a.name.localeCompare(b.name),
  )

// Agrupa por originCwd || cwd, como a barra. `labels` traz o nome de cada caminho
// (projectLabel); `statusOf`, o status ao vivo por id do CLI (fase 3).
export const groupProjects = (
  sessions: readonly DesktopSession[],
  labels: Readonly<Record<string, string>> = {},
  statusOf: Readonly<Record<string, Status>> = {},
): ProjectRow[] => {
  const byPath = new Map<string, DesktopSession[]>()
  for (const session of sessions) {
    if (!session.cwd) continue
    byPath.set(session.cwd, [...(byPath.get(session.cwd) ?? []), session])
  }
  const rows = [...byPath].map(([path, group]): ProjectRow => {
    const all = sortSessions(
      group.map(d => ({
        id: d.cliId,
        localId: d.localId,
        title: pickTitle({ summary: d.title }),
        lastActivity: d.lastActivity,
        status: statusOf[d.cliId] ?? 'idle',
      })),
    )
    return {
      path,
      name: labels[path] ?? projectName(path),
      status: bestStatus(all),
      lastActivity: Math.max(...all.map(row => row.lastActivity)),
      sessionCount: all.length,
      runningCount: all.filter(row => row.status === 'running').length,
      sessions: all.slice(0, PANE_SESSIONS),
    }
  })
  return sortProjects(rows)
}

// F8: fixados no topo, depois o projeto atual e todos os outros; cada seção já em F15.
// O atual fica na própria seção mesmo fixado (F11).
// Com busca ou filtro ativo (F12), "Todos os outros" vira "Resultados".
export const paneSections = (
  projects: readonly ProjectRow[],
  current: string,
  pins: Readonly<Record<string, boolean>>,
  isFiltered = false,
) => {
  const here = projects.filter(p => p.path === current)
  const others = projects.filter(p => p.path !== current)
  return [
    { label: 'Fixados', projects: others.filter(p => pins[p.path]) },
    { label: 'Projeto atual', projects: here },
    { label: isFiltered ? 'Resultados' : 'Todos os outros', projects: others.filter(p => !pins[p.path]) },
  ].filter(section => section.projects.length > 0)
}

// F12 e F13: busca por nome ou caminho, sem diferenciar maiúsculas, combinada com o status.
export const filterProjects = (projects: readonly ProjectRow[], query: string, filter: StatusFilter) => {
  const term = query.trim().toLowerCase()
  return projects.filter(
    p =>
      (filter === 'all' || p.status === filter) &&
      (!term || p.name.toLowerCase().includes(term) || p.path.toLowerCase().includes(term)),
  )
}

// F13: contagem de cada filtro, sobre todos os projetos.
export const statusCounts = (projects: readonly ProjectRow[]): Record<StatusFilter, number> => ({
  all: projects.length,
  waiting: projects.filter(p => p.status === 'waiting').length,
  running: projects.filter(p => p.status === 'running').length,
  idle: projects.filter(p => p.status === 'idle').length,
})

// F16: sugestões para `/p <termo>`. Escolher uma escreve o nome do projeto, que o /p usa
// como busca ao abrir o painel.
export const MAX_SUGGESTIONS = 8

export const autocompleteFor = (projects: Projects, term: string, now: number) => {
  const needle = term.trim().toLowerCase()
  if (!needle) return []
  const byProject = projects.list
    .filter(p => p.name.toLowerCase().includes(needle) || p.path.toLowerCase().includes(needle))
    .map(p => ({
      text: p.name,
      label: p.name,
      description: p.path === projects.current ? 'projeto atual' : `Última atividade ${relativeTime(p.lastActivity, now)}`,
    }))
  const bySession = projects.list.flatMap(p =>
    p.sessions
      .filter(s => s.title.toLowerCase().includes(needle))
      .map(s => ({ text: p.name, label: s.title, description: `${p.name} · ${relativeTime(s.lastActivity, now)}` })),
  )
  return [...byProject, ...bySession].slice(0, MAX_SUGGESTIONS)
}

// F9: a linha de status de um projeto.
export const projectStatusLine = (project: ProjectRow, now: number) => {
  if (project.status === 'waiting') return 'Aguardando sua permissão'
  if (project.runningCount > 0)
    return `${project.runningCount} ${project.runningCount === 1 ? 'sessão rodando' : 'sessões rodando'}`
  return `Última atividade ${relativeTime(project.lastActivity, now)}`
}
