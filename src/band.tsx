// Faixa acima do prompt (F1 a F6). Referência: docs/design/mod-a-painel-e-faixa.html e
// docs/design/mod-c-alerta.html.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, EventOf } from 'claude-code'

import { homeDir } from './index'
import { writeShared } from './live'
import { Avatar, Chip, GridToggle } from './avatar'
import { projectName, relativeTime, sortSessions, STATUS_COLOR } from './model'
import { newSession, openSession } from './open'
import { openPane, togglePane } from './pane'
import { countOthers, pendingAlert, reasonHash } from './status'

// O scan do engine só lê atoms declarados no próprio arquivo: cada um repete os seus.
// Troque o shape quando o formato mudar: um valor de outra versão volta ao inicial.
const here = atom({ plugin: 'project-nav', key: 'here' } as const, null, { shape: 'here-1' })
const sessions = atom({ plugin: 'project-nav', key: 'sessions' } as const, [], { shape: 'sessions-1' })
const bandOpen = atom({ plugin: 'project-nav', key: 'bandOpen' } as const, false)
const projects = atom({ plugin: 'project-nav', key: 'projects' } as const, null, { shape: 'projects-1' })
const others = atom({ plugin: 'project-nav', key: 'others' } as const, [], { shape: 'others-1' })
const dismissed = atom({ plugin: 'project-nav', key: 'dismissed' } as const, {})

// Cores dos contadores e do alerta, do protótipo.
const CHIP = {
  waiting: { bg: '#3A2A20', fg: '#F2B48C' },
  running: { bg: '#1E2A3A', fg: '#9CC3FF' },
  branch: { bg: '#2A2A30', fg: '#C9C9CF' },
} as const

const MAX_ROWS = 8

export async function renderBand($: EngineInterface, e: EventOf['ui.render'] & { component: 'AbovePrompt' }) {
  const current = await read($, here)
  if (!current) return undefined

  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const isOpen = await read($, bandOpen)
  const now = Date.now()
  const rows = sortSessions(await read($, sessions)).slice(0, MAX_ROWS)

  const toggle = () => update($, bandOpen, open => !open)

  // F2 e F6: as outras sessões, lidas a cada 5 s pelo register.
  const [live, gone, view] = await Promise.all([read($, others), read($, dismissed), read($, projects)])
  const counts = countOthers(live, now)
  const alert = pendingAlert(live, gone, now)
  const nameOf = (path: string) => view?.list.find(p => p.path === path)?.name ?? projectName(path)
  const later = async () => {
    if (!alert) return
    const next = { ...gone, [alert.sessionId]: reasonHash(alert.reason) }
    await update($, dismissed, () => next)
    await writeShared($, await homeDir($), 'dismissed', next)
  }

  return (
    <Box flexDirection="column">
      {alert && (
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor="#5A3E2C"
          backgroundColor="#241C17"
          paddingX={1}
          marginBottom={1}
        >
          <Box flexDirection="column">
            <Text color={CHIP.waiting.fg} bold>
              {`${nameOf(alert.projectPath)} precisa de você.`}
            </Text>
            <Text color="#D9B79F" wrap="truncate-end">
              {`A sessão “${alert.title || 'sem título'}” ${alert.reason ? `pede: ${alert.reason}` : 'aguarda você'}.`}
            </Text>
          </Box>
          <Box gap={1}>
            <Button
              key="alert-go"
              variant="primary"
              label="Ir para a sessão"
              onPress={() => openSession($, e.surface, { id: alert.sessionId, localId: alert.localId }, alert.projectPath)}
            />
            <Button key="alert-later" label="Depois" onPress={later} />
          </Box>
        </Box>
      )}
      {isOpen && (
        <Box flexDirection="column" paddingBottom={1} marginBottom={1} borderStyle="single" borderColor="#2E2E35">
          <Box justifyContent="space-between" alignItems="center">
            <Text dimColor bold size="caption">
              SESSÕES DE {current.name.toUpperCase()}
            </Text>
            <Button key="new" label="+ Nova sessão" onPress={() => newSession($, e.surface, current.root)} />
          </Box>
          {rows.map(row => {
            const isHere = row.id === current.id
            const color = isHere && e.props.isWorking ? STATUS_COLOR.running : STATUS_COLOR[row.status]
            // cor e negrito só fora do Button: o Desktop desenha o rótulo do Button sem os estilos dos filhos
            return (
              <Box key={`row-${row.id}`} gap={1} alignItems="center">
                <Text color={color}>●</Text>
                <Button
                  key={`s-${row.id}`}
                  plain
                  onPress={async () => {
                    await update($, bandOpen, () => false)
                    if (!isHere) await openSession($, e.surface, row, current.root)
                  }}
                >
                  {row.title}
                </Button>
                <Box flexGrow={1} />
                {row.branch && (
                  <Text dimColor mono size="footnote">
                    {row.branch}
                  </Text>
                )}
                <Text dimColor size="footnote">
                  {isHere ? 'atual' : relativeTime(row.lastActivity, now)}
                </Text>
              </Box>
            )
          })}
          {rows.length === 0 && <Text dimColor>Nenhuma sessão salva neste projeto.</Text>}
          <Text dimColor size="footnote">
            Para trocar de projeto, clique no nome do projeto: ele abre o painel.
          </Text>
        </Box>
      )}
      <Box justifyContent="space-between" alignItems="center">
        <Box gap={1} alignItems="center" flexShrink={1}>
          {Avatar(elements, current.name, current.root)}
          <Button key="project" plain onPress={() => openPane($)}>
            {current.name}
          </Button>
          <Text dimColor>›</Text>
          {/* com borda, como no protótipo: é o botão que abre a lista de sessões */}
          <Button key="session" variant="secondary" onPress={toggle}>
            {`${current.title} ${isOpen ? '▴' : '▾'}`}
          </Button>
          {current.branch && Chip(elements, current.branch, CHIP.branch, true)}
        </Box>
        <Box gap={1} alignItems="center" flexShrink={0}>
          {counts.waiting > 0 && Chip(elements, `${counts.waiting} aguardando`, CHIP.waiting)}
          {counts.running > 0 && Chip(elements, `${counts.running} rodando`, CHIP.running)}
          {/* F5: grade que abre e fecha o painel, como o /p */}
          {GridToggle(elements, e.surface, 'grid', () => togglePane($))}
        </Box>
      </Box>
    </Box>
  )
}
