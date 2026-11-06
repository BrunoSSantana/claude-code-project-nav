// Status entre sessões (fase 3): funções puras, testadas em tests/status.test.ts.
// Cada sessão com o mod grava o próprio estado num arquivo (ver live.ts); estas
// funções decidem o que é recente, o que conta nos contadores e o que vira alerta.

import type { LiveEntry, SessionRow } from '../types'

export type { LiveEntry } from '../types'

// Sem pulso há mais que isso, a sessão é tratada como fechada (o app pode ter caído
// sem disparar session.end).
export const STALE_MS = 60_000

export const isFresh = (entry: LiveEntry, now: number) => now - entry.updatedAt <= STALE_MS

// Lê um arquivo de status com leitura defensiva: formato estranho vira null.
export const parseLiveEntry = (text: string): LiveEntry | null => {
  try {
    const raw = JSON.parse(text)
    const isStatus = raw?.status === 'waiting' || raw?.status === 'running' || raw?.status === 'idle'
    if (typeof raw?.sessionId !== 'string' || typeof raw.updatedAt !== 'number' || !isStatus) return null
    return {
      sessionId: raw.sessionId,
      localId: typeof raw.localId === 'string' ? raw.localId : undefined,
      projectPath: typeof raw.projectPath === 'string' ? raw.projectPath : '',
      title: typeof raw.title === 'string' ? raw.title : '',
      branch: typeof raw.branch === 'string' ? raw.branch : undefined,
      status: raw.status,
      reason: typeof raw.reason === 'string' ? raw.reason : undefined,
      updatedAt: raw.updatedAt,
    }
  } catch {
    return null
  }
}

// F2: contadores das outras sessões; só as recentes contam.
export const countOthers = (others: readonly LiveEntry[], now: number) => {
  const fresh = others.filter(entry => isFresh(entry, now))
  return {
    waiting: fresh.filter(entry => entry.status === 'waiting').length,
    running: fresh.filter(entry => entry.status === 'running').length,
  }
}

// Motivo curto de um pedido de permissão: "Bash: npm run build".
export const reasonFor = (tool: string, input: unknown) => {
  const fields = (input ?? {}) as Record<string, unknown>
  const detail = [fields.command, fields.file_path, fields.url, fields.pattern, fields.description].find(
    value => typeof value === 'string' && value.trim(),
  ) as string | undefined
  const summary = detail?.replace(/\s+/g, ' ').trim()
  if (!summary) return tool
  return `${tool}: ${summary.length > 80 ? `${summary.slice(0, 79)}…` : summary}`
}

// Identifica um pedido: "Depois" recolhe o alerta até o motivo mudar.
export const reasonHash = (reason: string | undefined) => {
  let hash = 0
  for (const char of reason ?? '') hash = (hash * 31 + char.charCodeAt(0)) | 0
  return (hash >>> 0).toString(36)
}

// F6: o alerta mostra a sessão aguardando mais recente que a pessoa não dispensou.
export const pendingAlert = (
  others: readonly LiveEntry[],
  dismissed: Readonly<Record<string, string>>,
  now: number,
) =>
  others
    .filter(entry => isFresh(entry, now) && entry.status === 'waiting')
    .filter(entry => dismissed[entry.sessionId] !== reasonHash(entry.reason))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]

// Aplica o status ao vivo às linhas de sessão lidas do disco.
export const withLiveStatus = (rows: readonly SessionRow[], live: readonly LiveEntry[], now: number): SessionRow[] => {
  const byId = new Map(live.filter(entry => isFresh(entry, now)).map(entry => [entry.sessionId, entry]))
  return rows.map(row => {
    const entry = byId.get(row.id)
    return entry ? { ...row, status: entry.status, lastActivity: Math.max(row.lastActivity, entry.updatedAt) } : row
  })
}
