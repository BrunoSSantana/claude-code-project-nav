import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { renderBand } from '../src/band'
import { currentBranch, homeDir, readCliSessions, readDesktopSessions, readProjects } from '../src/index'
import { readLive, readShared, removeLive, writeLive } from '../src/live'
import { autocompleteFor, mergeSessions, PANE, pickTitle, projectName } from '../src/model'
import { openPane, rememberPane, renderPane, togglePane, wasPaneOpen } from '../src/pane'
import { isFresh, reasonFor, withLiveStatus } from '../src/status'
import type { Status } from '../types'

// O scan do engine só lê atoms declarados no próprio arquivo: cada um repete os seus.
// Troque o shape quando o formato mudar: um valor de outra versão volta ao inicial.
const here = atom({ plugin: 'project-nav', key: 'here' } as const, null, { shape: 'here-1' })
const sessions = atom({ plugin: 'project-nav', key: 'sessions' } as const, [], { shape: 'sessions-1' })
const projects = atom({ plugin: 'project-nav', key: 'projects' } as const, null, { shape: 'projects-1' })
const pins = atom({ plugin: 'project-nav', key: 'pins' } as const, {})
const others = atom({ plugin: 'project-nav', key: 'others' } as const, [], { shape: 'others-1' })
const dismissed = atom({ plugin: 'project-nav', key: 'dismissed' } as const, {})
const query = atom({ plugin: 'project-nav', key: 'query' } as const, '')

// Pulso do próprio status e leitura das outras sessões (docs/SPEC.md, "Events and status").
const PULSE_MS = 15_000
const POLL_MS = 5_000

// O que esta sessão publica para as outras (fase 3). Variáveis do módulo: um reload
// recomeça como parado, e o próximo evento corrige.
let status: Status = 'idle'
let reason: string | undefined
let localId: string | undefined
let othersSignature = ''

async function publish($: EngineInterface) {
  const [current, view, home] = await Promise.all([read($, here), read($, projects), homeDir($)])
  if (!current) return
  await writeLive($, home, {
    sessionId: current.id,
    localId,
    // a chave do projeto como a barra do Desktop agrupa, para o painel das outras sessões
    projectPath: view?.current ?? current.root,
    title: current.title,
    branch: current.branch,
    status,
    reason,
    updatedAt: Date.now(),
  })
}

async function setStatus($: EngineInterface, next: Status, why?: string) {
  if (status === next && reason === why) return
  status = next
  reason = why
  await publish($)
}

// Relê o histórico do projeto atual e o estado desta sessão.
async function refresh($: EngineInterface) {
  const [id, root, home] = await Promise.all([$.session.id(), $.session.root(), homeDir($)])
  const [cli, desk, branch, live, pinned] = await Promise.all([
    readCliSessions($, home, root),
    readDesktopSessions($, home),
    currentBranch($, await $.session.cwd()),
    readLive($, home),
    readShared<Record<string, boolean>>($, home, 'pins', {}),
  ])
  const now = Date.now()
  const rows = withLiveStatus(mergeSessions(cli, desk), live, now)
  const mine = rows.find(row => row.id === id)
  localId = desk.find(session => session.cliId === id)?.localId
  const statusOf: Record<string, Status> = Object.fromEntries(
    live.filter(entry => isFresh(entry, now)).map(entry => [entry.sessionId, entry.status]),
  )
  const list = await readProjects($, desk, id, root, statusOf)
  await update($, sessions, () => rows)
  await update($, projects, () => list)
  await update($, pins, () => pinned)
  await update($, here, () => ({
    id,
    root,
    name: projectName(root),
    title: mine?.title ?? pickTitle({}),
    branch,
  }))
}

// F2 e F6: as outras sessões, a cada 5 s. Mudou o status de alguma, o painel relê.
async function pollOthers($: EngineInterface) {
  const [id, home] = await Promise.all([$.session.id(), homeDir($)])
  const [live, gone] = await Promise.all([
    readLive($, home),
    readShared<Record<string, string>>($, home, 'dismissed', {}),
  ])
  const now = Date.now()
  const fresh = live.filter(entry => entry.sessionId !== id && isFresh(entry, now))
  const signature = fresh
    .map(entry => `${entry.sessionId}:${entry.status}:${entry.reason ?? ''}`)
    .sort()
    .join('|')
  // escrever o mesmo valor redesenharia a faixa a cada 5 s
  if (JSON.stringify(await read($, dismissed)) !== JSON.stringify(gone)) await update($, dismissed, () => gone)
  if (signature === othersSignature) return
  othersSignature = signature
  await update($, others, () => fresh)
  void refresh($)
}

async function refreshBranch($: EngineInterface) {
  const branch = await currentBranch($, await $.session.cwd())
  await update($, here, current => (current && current.branch !== branch ? { ...current, branch } : current))
}

// O que dá para saber sem varrer o disco: a faixa aparece já com projeto e branch.
async function quickHere($: EngineInterface) {
  const [id, root, cwd] = await Promise.all([$.session.id(), $.session.root(), $.session.cwd()])
  const branch = await currentBranch($, cwd)
  await update($, here, current => current ?? { id, root, name: projectName(root), title: pickTitle({}), branch })
}

// A primeira pergunta de um AskUserQuestion, como motivo do alerta.
const questionOf = (input: unknown) => {
  const first = (input as { questions?: { question?: unknown }[] } | undefined)?.questions?.[0]?.question
  return typeof first === 'string' ? `Pergunta: ${first.slice(0, 80)}` : 'Pergunta aberta'
}

export const register: Register = on => {
  // A varredura não cabe no orçamento do hook: com ela aqui, o hook era descartado e a
  // faixa só ganhava dados no primeiro turn.complete. Ela roda em timers, fora do hook.
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await quickHere($)
    await publish($)
    // F7: /p abre e fecha o painel de projetos
    await $.command.register({
      name: 'p',
      description: 'Abre ou fecha o painel de projetos',
      argumentHint: '[termo]',
    })
    $.clock.after(0, async () => {
      if (await wasPaneOpen($)) void openPane($)
      await refresh($)
      await publish($)
    })
    $.clock.every(30_000, () => void refresh($))
    $.clock.every(PULSE_MS, () => void publish($))
    $.clock.every(POLL_MS, () => void pollOthers($))
    return started
  })

  on('session.end', async ($, e, next) => {
    const ended = await next(e)
    await removeLive($, await homeDir($), e.sessionId)
    return ended
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await setStatus($, 'running')
    return next(e)
  })

  // O título nasce depois do primeiro turno; o branch pode mudar em qualquer um.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) await setStatus($, 'idle')
    void refresh($)
    return done
  })

  // Só observa: o veredito segue como veio. Pedido à pessoa vira "aguardando".
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask') await setStatus($, 'waiting', reasonFor(e.tool, e.input))
    return verdict
  }).catch(($, e, next) => next(e))

  // Depois da ferramenta (aprovada, negada ou respondida), a sessão volta a rodar.
  // F1: o branch acompanha um `git checkout` feito pelo Claude.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion') await setStatus($, 'waiting', questionOf(e))
    const ran = await next(e)
    if (status === 'waiting') await setStatus($, 'running')
    if (e.tool === 'Bash' && /\bgit\b/.test(String((e as { command?: unknown }).command))) void refreshBranch($)
    return ran
  }).catch(($, e, next) => next(e))

  // /p abre e fecha; /p <termo> abre já filtrado (F16).
  on('command.run', { command: 'p' }, async ($, e) => {
    const term = e.args.trim()
    if (term) {
      await update($, query, () => term)
      await openPane($)
      return { text: `Painel de projetos aberto, filtrado por "${term}".` }
    }
    const isOpen = await togglePane($)
    return { text: isOpen ? 'Painel de projetos aberto.' : 'Painel de projetos fechado.' }
  })

  // F16: sugestões de projetos e sessões ao digitar `/p <termo>`.
  on('prompt.autocomplete', async ($, e, next) => {
    const found = await next(e)
    if (!/^\/p\s/.test(e.text) || e.start < 3) return found
    const view = await read($, projects)
    if (!view) return found
    return { suggestions: [...found.suggestions, ...autocompleteFor(view, e.token, Date.now())] }
  })

  // Fechado pelo X do painel: a próxima sessão abre sem ele (F7).
  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') await rememberPane($, false)
    return closed
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return (await renderBand($, e)) ?? next(e)
  })

  // matcher com literal: o validate lê o requestId direto da fonte
  on('ui.render', { component: 'Pane', requestId: 'project-nav' }, renderPane)
}
