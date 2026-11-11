// Painel de projetos (Pane `project-nav`): F7 a F15. Referência:
// docs/design/mod-a-painel-e-faixa.html e docs/design/mod-b-busca.html. A lista segue a barra lateral do Desktop
// (docs/SPEC.md, "Projects: the Desktop rule").

import { atom, read, update } from 'claude-code'
import type { EngineInterface, EventOf } from 'claude-code'

import type { ProjectRow, StatusFilter } from '../types'
import { homeDir } from './index'
import { writeShared } from './live'
import { Avatar, Pill, PinToggle, Pressable, RowPress } from './avatar'
import {
  filterProjects,
  PANE,
  paneSections,
  projectStatusLine,
  relativeTime,
  STATUS_COLOR,
  statusCounts,
} from './model'
import { openSession } from './open'
import { THEME } from './theme'

// O scan do engine só lê atoms declarados no próprio arquivo: cada um repete os seus.
const here = atom({ plugin: 'project-nav', key: 'here' } as const, null, { shape: 'here-1' })
const projects = atom({ plugin: 'project-nav', key: 'projects' } as const, null, { shape: 'projects-1' })
const expanded = atom({ plugin: 'project-nav', key: 'expanded' } as const, {})
const pins = atom({ plugin: 'project-nav', key: 'pins' } as const, {})
const query = atom({ plugin: 'project-nav', key: 'query' } as const, '')
const filter = atom({ plugin: 'project-nav', key: 'filter' } as const, 'all')

const FILTERS: { key: StatusFilter; label: string; dot: string }[] = [
  { key: 'all', label: 'Todos', dot: THEME.muted },
  { key: 'waiting', label: 'Aguardando', dot: STATUS_COLOR.waiting },
  { key: 'running', label: 'Rodando', dot: STATUS_COLOR.running },
  { key: 'idle', label: 'Parados', dot: STATUS_COLOR.idle },
]

// F7: o painel lembra se estava aberto entre sessões.
const UI_KEY = 'nav:ui'

export async function rememberPane($: EngineInterface, isOpen: boolean) {
  const saved = await $.store.get(UI_KEY)
  const ui = saved && typeof saved === 'object' ? saved : {}
  await $.store.set(UI_KEY, { ...ui, paneOpen: isOpen })
}

export async function wasPaneOpen($: EngineInterface) {
  const saved = (await $.store.get(UI_KEY)) as { paneOpen?: unknown } | undefined
  return saved?.paneOpen === true
}

export async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'Projetos' })
  await rememberPane($, true)
}

// F5 e F7: o botão de grade e o /p abrem e fecham.
export async function togglePane($: EngineInterface) {
  const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (!isUp) {
    await openPane($)
    return true
  }
  await $.ui.close({ id: PANE })
  await rememberPane($, false)
  return false
}

const SUB_COLOR = { waiting: THEME.waiting, running: THEME.running } as const
const OPEN_BG = THEME.surface

export async function renderPane($: EngineInterface, e: EventOf['ui.render']) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  // o mobile não tem Input: lá o painel fica sem busca
  const Input = 'Input' in elements ? elements.Input : undefined
  const view = await read($, projects)
  if (!view) return <Text dimColor>Lendo os projetos do Desktop…</Text>

  const [current, open, pinned, term, status] = await Promise.all([
    read($, here),
    read($, expanded),
    read($, pins),
    read($, query),
    read($, filter),
  ])
  const now = Date.now()
  const isDesktop = e.surface === 'desktop'
  const isFiltered = status !== 'all' || term.trim() !== ''
  const sections = paneSections(filterProjects(view.list, term, status), view.current, pinned, isFiltered)
  const counts = statusCounts(view.list)
  const clear = async () => {
    await update($, query, () => '')
    await update($, filter, () => 'all')
  }
  // F11: fixados valem para todas as sessões da máquina.
  const togglePin = async (path: string) => {
    const next = { ...pinned }
    if (next[path]) delete next[path]
    else next[path] = true
    await update($, pins, () => next)
    await writeShared($, await homeDir($), 'pins', next)
  }

  const projectRow = (project: ProjectRow) => {
    const isOpen = open[project.path] ?? project.path === view.current
    const toggle = () => update($, expanded, all => ({ ...all, [project.path]: !isOpen }))
    const subColor = project.status === 'idle' ? undefined : SUB_COLOR[project.status]
    const statusLine = projectStatusLine(project, now)
    // cor e negrito só fora do Button: o Desktop desenha o rótulo do Button sem os estilos dos filhos
    return (
      <Box
        key={`p-${project.path}`}
        flexDirection="column"
        backgroundColor={isOpen ? OPEN_BG : undefined}
        paddingX={1}
        paddingY={isOpen ? 1 : 0}
      >
        <Box gap={1} alignItems="center">
          {Avatar(elements, project.name, project.path, 30)}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {/* F9: clicar na linha expande; no Desktop o nome fica em negrito com o clique por cima */}
            {Pressable(
              elements,
              e.surface,
              `name-${project.path}`,
              project.name,
              toggle,
              <Box flexDirection="column">
                <Text bold wrap="truncate-end" size="footnote">
                  {project.name}
                </Text>
                <Text color={subColor} dimColor={!subColor} wrap="truncate-end" size="caption">
                  {statusLine}
                </Text>
              </Box>,
              Math.max(project.name.length, statusLine.length),
              <Box flexDirection="column">
                <Button key={`name-${project.path}`} plain onPress={toggle}>
                  {project.name}
                </Button>
                <Text color={subColor} dimColor={!subColor} wrap="truncate-end">
                  {statusLine}
                </Text>
              </Box>,
            )}
          </Box>
          <Button key={`chev-${project.path}`} plain dimColor label={isOpen ? '▾' : '▸'} onPress={toggle} />
          {PinToggle(elements, e.surface, `pin-${project.path}`, !!pinned[project.path], () => togglePin(project.path))}
        </Box>
        {isOpen && (
          <Box flexDirection="column" paddingLeft={isDesktop ? 3 : 4}>
            {project.sessions.map(session => {
              const isHere = session.id === current?.id
              const when = isHere ? 'aberta aqui' : relativeTime(session.lastActivity, now)
              const go = () => openSession($, e.surface, session, project.path)
              const dot = (
                <Text color={STATUS_COLOR[session.status]} size="caption">
                  ●
                </Text>
              )
              if (!isDesktop) {
                return (
                  <Box key={`s-${session.id}`} gap={1} alignItems="center">
                    {dot}
                    <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                      {isHere ? (
                        <Text wrap="truncate-end">{session.title}</Text>
                      ) : (
                        <Button key={`go-${session.id}`} plain onPress={go}>
                          {session.title}
                        </Button>
                      )}
                      <Text dimColor>{when}</Text>
                    </Box>
                    {isHere ? <Text dimColor>esta sessão</Text> : <Text dimColor>›</Text>}
                  </Box>
                )
              }
              // F10, Desktop: a sessão é uma caixa; no hover a borda arredondada aparece e o
              // "Abrir" inverte (um grupo, `scope`, liga os dois). O clique é um Button em branco
              // da altura da caixa (RowPress), mais largo e cortado por ela: o destaque nativo dele,
              // que o Desktop desenha de todo jeito, vira o fundo da caixa inteira no hover.
              // A aberta aqui não tem clique nem hover.
              const scope = `s-${session.id}`
              return (
                <Box
                  key={isHere ? undefined : scope}
                  position="relative"
                  overflow="hidden"
                  borderStyle="round"
                  borderColor={OPEN_BG}
                  hover={isHere ? undefined : { scope, borderColor: THEME.border }}
                  paddingX={1}
                  gap={1}
                  alignItems="center"
                >
                  {dot}
                  <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                    <Text wrap="truncate-end" size="footnote">
                      {session.title}
                    </Text>
                    <Text dimColor size="caption">
                      {when}
                    </Text>
                  </Box>
                  {isHere ? (
                    <Text dimColor size="caption">
                      esta sessão
                    </Text>
                  ) : (
                    <Box position="relative">
                      {Pill(elements, 'Abrir')}
                      <Box position="absolute" top={0} left={0} display="none" hover={{ scope, display: 'flex' }}>
                        {Pill(elements, 'Abrir', true)}
                      </Box>
                    </Box>
                  )}
                  {!isHere && RowPress(elements, `go-${session.id}`, go)}
                </Box>
              )
            })}
          </Box>
        )}
        {isOpen && project.sessionCount > project.sessions.length && (
          <Box paddingLeft={isDesktop ? 5 : 4}>
            <Text dimColor size="caption">
              {`+ ${project.sessionCount - project.sessions.length} na barra lateral do Desktop`}
            </Text>
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {/* o título "Projetos" já vem na moldura do painel; aqui fica só o total */}
      <Text dimColor size="caption">{`${view.list.length} projetos no total`}</Text>
      {Input && (
        <Box flexDirection="column" width="100%">
          <Input
            key="search"
            placeholder="Filtrar por nome ou pasta"
            value={term}
            onInput={value => update($, query, () => value)}
            onSubmit={value => update($, query, () => value)}
          />
        </Box>
      )}
      <Box columnGap={1} rowGap={0} flexWrap="wrap">
        {FILTERS.map(f => {
          const isOn = status === f.key
          const label = `${f.label} ${counts[f.key]}`
          const pick = () => update($, filter, () => f.key)
          // pílula do protótipo: ponto colorido, rótulo e contagem; a ativa fica clara
          const pill = (
            <Box backgroundColor={isOn ? THEME.inverseBg : THEME.surface} paddingX={1} gap={1} alignItems="center">
              <Text color={f.dot} size="caption">
                ●
              </Text>
              <Text color={isOn ? THEME.inverseText : THEME.text} size="footnote">
                {f.label}
              </Text>
              <Text color={isOn ? THEME.inverseText : THEME.muted} size="footnote">
                {String(counts[f.key])}
              </Text>
            </Box>
          )
          const fallback = (
            <Box key={`f-${f.key}`} gap={1} alignItems="center">
              <Text color={f.dot}>●</Text>
              <Button
                key={`filter-${f.key}`}
                variant={isOn ? 'primary' : 'secondary'}
                label={label}
                onPress={pick}
              />
            </Box>
          )
          return Pressable(elements, e.surface, `filter-${f.key}`, label, pick, pill, label.length + 4, fallback)
        })}
      </Box>
      {sections.length === 0 && view.list.length === 0 && <Text dimColor>Nenhuma sessão do Desktop encontrada.</Text>}
      {sections.length === 0 && view.list.length > 0 && (
        <Box flexDirection="column" alignItems="center" gap={1}>
          <Text dimColor>Nenhum projeto com esse filtro.</Text>
          <Button key="clear" label="Limpar filtros" onPress={clear} />
        </Box>
      )}
      {sections.map(section => (
        <Box key={`sec-${section.label}`} flexDirection="column">
          <Box justifyContent="space-between" paddingX={1}>
            <Text dimColor bold size="caption">
              {section.label.toUpperCase()}
            </Text>
            {section.label !== 'Projeto atual' && (
              <Text dimColor size="caption">
                {String(section.projects.length)}
              </Text>
            )}
          </Box>
          <Box flexDirection="column" gap={isDesktop ? 1 : 0}>
            {section.projects.map(projectRow)}
          </Box>
        </Box>
      ))}
      <Box borderStyle="single" borderColor={THEME.border} paddingTop={1}>
        <Text dimColor size="footnote">
          Fixados e status ficam salvos para todas as sessões
        </Text>
      </Box>
    </Box>
  )
}
