// Estado ao vivo entre sessões (fase 3). Cada sessão grava um arquivo próprio em
// ~/.claude/project-nav/live/<sessionId>.json e lê os das outras: um arquivo por
// sessão evita que duas sessões sobrescrevam o estado uma da outra (ver docs/SPEC.md).

import type { EngineInterface } from 'claude-code'

import { sh } from './index'
import type { LiveEntry } from './status'
import { parseLiveEntry } from './status'

const dataDir = (home: string) => `${home}/.claude/project-nav`
const liveDir = (home: string) => `${dataDir(home)}/live`
// Ids de sessão são uuids; qualquer outra coisa não vira nome de arquivo.
const liveFile = (home: string, sessionId: string) => `${liveDir(home)}/${sessionId.replace(/[^A-Za-z0-9-]/g, '')}.json`

export async function writeLive($: EngineInterface, home: string, entry: LiveEntry) {
  await $.fs.write(liveFile(home, entry.sessionId), JSON.stringify(entry))
}

export async function removeLive($: EngineInterface, home: string, sessionId: string) {
  await sh($, ['rm', '-f', liveFile(home, sessionId)])
}

export async function readLive($: EngineInterface, home: string): Promise<LiveEntry[]> {
  let entries
  try {
    entries = await $.fs.list(liveDir(home))
  } catch {
    return []
  }
  const found = await Promise.all(
    entries
      .filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
      .map(async entry => {
        try {
          return parseLiveEntry(await $.fs.read(`${liveDir(home)}/${entry.name}`))
        } catch {
          // a sessão apagou o arquivo entre o list e o read
          return null
        }
      }),
  )
  return found.filter((entry): entry is LiveEntry => entry !== null)
}

// Valores compartilhados entre sessões e escritos só por um clique da pessoa:
// fixados (fase 4) e alertas dispensados (F6).
export async function readShared<T>($: EngineInterface, home: string, name: 'pins' | 'dismissed', fallback: T): Promise<T> {
  try {
    return JSON.parse(await $.fs.read(`${dataDir(home)}/${name}.json`)) as T
  } catch {
    return fallback
  }
}

export async function writeShared($: EngineInterface, home: string, name: 'pins' | 'dismissed', value: unknown) {
  await $.fs.write(`${dataDir(home)}/${name}.json`, JSON.stringify(value))
}
