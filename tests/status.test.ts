import { expect, test } from 'claude-code/testing'

import {
  countOthers,
  isFresh,
  parseLiveEntry,
  pendingAlert,
  reasonFor,
  reasonHash,
  STALE_MS,
  withLiveStatus,
} from '../src/status'
import type { LiveEntry } from '../src/status'

const NOW = 1_000_000
const entry = (sessionId: string, status: LiveEntry['status'], updatedAt = NOW, reason?: string): LiveEntry => ({
  sessionId,
  projectPath: '/p',
  title: sessionId,
  status,
  reason,
  updatedAt,
})

test('isFresh descarta pulso mais velho que 60 s', async () => {
  expect(isFresh(entry('a', 'idle', NOW - STALE_MS), NOW)).toBe(true)
  expect(isFresh(entry('a', 'idle', NOW - STALE_MS - 1), NOW)).toBe(false)
})

test('parseLiveEntry aceita o formato e recusa o resto', async () => {
  expect(parseLiveEntry(JSON.stringify(entry('a', 'running')))?.status).toBe('running')
  expect(parseLiveEntry('{"sessionId":"a","status":"outro","updatedAt":1}')).toBeNull()
  expect(parseLiveEntry('não é json')).toBeNull()
})

test('countOthers soma só as recentes (F2)', async () => {
  const counts = countOthers(
    [entry('a', 'waiting'), entry('b', 'running'), entry('c', 'running'), entry('d', 'waiting', NOW - STALE_MS - 1)],
    NOW,
  )
  expect(counts).toEqual({ waiting: 1, running: 2 })
})

test('reasonFor resume ferramenta e comando', async () => {
  expect(reasonFor('Bash', { command: 'npm   run build' })).toBe('Bash: npm run build')
  expect(reasonFor('Edit', { file_path: '/a/b.ts' })).toBe('Edit: /a/b.ts')
  expect(reasonFor('Agent', {})).toBe('Agent')
  expect(reasonFor('Bash', { command: 'x'.repeat(200) }).length).toBeLessThanOrEqual(86)
})

test('pendingAlert respeita "Depois" até o motivo mudar (F6)', async () => {
  const others = [entry('a', 'waiting', NOW - 10, 'Bash: ls'), entry('b', 'waiting', NOW - 5, 'Bash: npm run build')]
  expect(pendingAlert(others, {}, NOW)?.sessionId).toBe('b')
  expect(pendingAlert(others, { b: reasonHash('Bash: npm run build') }, NOW)?.sessionId).toBe('a')
  const both = { a: reasonHash('Bash: ls'), b: reasonHash('Bash: npm run build') }
  expect(pendingAlert(others, both, NOW)).toBeUndefined()
  const changed = [entry('a', 'waiting', NOW, 'Bash: rm build')]
  expect(pendingAlert(changed, both, NOW)?.sessionId).toBe('a')
})

test('withLiveStatus aplica o status recente às linhas', async () => {
  const rows = [
    { id: 'a', title: 'a', lastActivity: 1, status: 'idle' as const },
    { id: 'b', title: 'b', lastActivity: 1, status: 'idle' as const },
  ]
  const out = withLiveStatus(rows, [entry('a', 'running'), entry('b', 'waiting', NOW - STALE_MS - 1)], NOW)
  expect(out[0]).toEqual({ id: 'a', title: 'a', lastActivity: NOW, status: 'running' })
  expect(out[1]?.status).toBe('idle')
})
