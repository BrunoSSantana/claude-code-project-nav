// Leitura do histórico: ~/.claude/projects (CLI) e o registro de sessões do Desktop.
// Resultados da fase 0 em docs/SPEC.md explicam os formatos.

import type { EngineInterface } from 'claude-code'

import type { Projects, Status } from '../types'
import type { CliSession, DesktopSession } from './model'
import { encodeProject, groupProjects, projectLabel, sidebarScope } from './model'

// Quantas sessões por projeto ler do disco (F10 mostra 5; a faixa, até 8).
const SESSIONS_PER_PROJECT = 20

export async function sh($: EngineInterface, argv: string[], cwd?: string) {
  try {
    const out = await $.process.run(argv, { cwd, timeoutMs: 5000 })
    return { ok: out.exitCode === 0, text: out.stdout.trim() }
  } catch {
    return { ok: false, text: '' }
  }
}

export async function homeDir($: EngineInterface) {
  return (await $.env.get('HOME')) ?? ''
}

// undefined fora de um repositório ou em HEAD destacado.
export async function currentBranch($: EngineInterface, cwd: string) {
  const out = await sh($, ['git', 'branch', '--show-current'], cwd)
  return out.ok && out.text ? out.text : undefined
}

// Cache por arquivo e mtime; recomeça a cada reload do mod (a fase 2 leva para nav:index).
const desktopCache = new Map<string, { mtime: string; session: DesktopSession | null }>()
const cliCache = new Map<string, { mtime: number; session: CliSession }>()

export async function readDesktopSessions($: EngineInterface, home: string): Promise<DesktopSession[]> {
  const listing = await sh($, [
    'find',
    `${home}/.config/Claude/claude-code-sessions`,
    '-name',
    'local_*.json',
    '-printf',
    '%T@ %p\\n',
  ])
  if (!listing.ok) return []

  const found: DesktopSession[] = []
  for (const line of listing.text.split('\n').filter(Boolean)) {
    const space = line.indexOf(' ')
    const mtime = line.slice(0, space)
    const file = line.slice(space + 1)
    let cached = desktopCache.get(file)
    if (cached?.mtime !== mtime) {
      cached = { mtime, session: await readDesktopFile($, file, file.slice(0, file.lastIndexOf('/'))) }
      desktopCache.set(file, cached)
    }
    if (cached.session) found.push(cached.session)
  }
  return found
}

async function readDesktopFile($: EngineInterface, file: string, dir: string): Promise<DesktopSession | null> {
  try {
    const raw = JSON.parse(await $.fs.read(file))
    if (raw.isArchived || typeof raw.sessionId !== 'string' || typeof raw.cliSessionId !== 'string') return null
    return {
      localId: raw.sessionId,
      cliId: raw.cliSessionId,
      title: typeof raw.title === 'string' ? raw.title : '',
      cwd: typeof raw.originCwd === 'string' ? raw.originCwd : (raw.cwd ?? ''),
      lastActivity: typeof raw.lastActivityAt === 'number' ? raw.lastActivityAt : 0,
      dir,
    }
  } catch {
    // arquivo sumiu ou mudou de formato: leitura defensiva
    return null
  }
}

// URL do remote origin de um projeto, '' sem ela: o Desktop nomeia o projeto pelo repo
// do GitHub (docs/SPEC.md, "Projects: the Desktop rule"). Remote quase nunca muda: cache até
// o próximo reload do mod.
const originCache = new Map<string, string>()

export async function originUrl($: EngineInterface, path: string) {
  let url = originCache.get(path)
  if (url === undefined) {
    const out = await sh($, ['git', 'remote', 'get-url', 'origin'], path)
    url = out.ok ? out.text : ''
    originCache.set(path, url)
  }
  return url
}

// Os projetos da barra lateral do Desktop, com o desta sessão marcado. Sem registro do
// Desktop para esta sessão (terminal), o projeto atual é a raiz da sessão.
export async function readProjects(
  $: EngineInterface,
  desk: readonly DesktopSession[],
  cliId: string,
  root: string,
  statusOf: Readonly<Record<string, Status>> = {},
): Promise<Projects> {
  const scoped = sidebarScope(desk, cliId)
  const paths = [...new Set(scoped.map(session => session.cwd).filter(Boolean))]
  const labels = Object.fromEntries(
    await Promise.all(paths.map(async path => [path, projectLabel(path, await originUrl($, path))] as const)),
  )
  return {
    current: scoped.find(session => session.cliId === cliId)?.cwd ?? root,
    list: groupProjects(scoped, labels, statusOf),
  }
}

// Título (última linha custom-title), primeiros prompts e último gitBranch, sem ler o
// arquivo inteiro: há .jsonl de 20 MB, acima dos 4 MiB de $.fs.read.
const PEEK = [
  'f="$1"',
  `grep -h '"type":"custom-title"' "$f" | tail -n 1`,
  'echo @@',
  `grep -m 4 '"type":"user"' "$f" | cut -c 1-20000`,
  'echo @@',
  `tail -c 65536 "$f" | grep -o '"gitBranch":"[^"]*"' | tail -n 1`,
].join('\n')

const firstPromptOf = (lines: string[]) => {
  for (const line of lines) {
    try {
      const row = JSON.parse(line)
      if (row.isMeta) continue
      const content = row.message?.content
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.find((block: { type?: string }) => block.type === 'text')?.text
            : undefined
      // comandos e notificações chegam como <tag>…</tag>: não são o prompt da pessoa
      if (typeof text === 'string' && text.trim() && !text.trimStart().startsWith('<')) return text
    } catch {
      // linha cortada pelo `cut`: pula
    }
  }
  return undefined
}

async function readCliFile($: EngineInterface, file: string, id: string, mtime: number): Promise<CliSession> {
  const out = await sh($, ['sh', '-c', PEEK, 'peek', file])
  const [titleLine = '', userLines = '', branchLine = ''] = out.text.split('@@').map(part => part.trim())
  let summary: string | undefined
  try {
    summary = JSON.parse(titleLine).customTitle
  } catch {
    summary = undefined
  }
  return {
    id,
    lastActivity: mtime,
    summary,
    firstPrompt: firstPromptOf(userLines.split('\n')),
    branch: branchLine.match(/"gitBranch":"([^"]*)"/)?.[1],
  }
}

export async function readCliSessions($: EngineInterface, home: string, root: string): Promise<CliSession[]> {
  const dir = `${home}/.claude/projects/${encodeProject(root)}`
  let entries
  try {
    entries = await $.fs.list(dir)
  } catch {
    return []
  }
  const files = entries
    .filter(entry => entry.kind === 'file' && entry.name.endsWith('.jsonl'))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, SESSIONS_PER_PROJECT)

  return Promise.all(
    files.map(async entry => {
      const file = `${dir}/${entry.name}`
      const cached = cliCache.get(file)
      if (cached?.mtime === entry.mtimeMs) return cached.session
      const session = await readCliFile($, file, entry.name.replace(/\.jsonl$/, ''), entry.mtimeMs)
      cliCache.set(file, { mtime: entry.mtimeMs, session })
      return session
    }),
  )
}
