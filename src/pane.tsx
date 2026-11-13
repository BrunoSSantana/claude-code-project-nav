// Painel de projetos (Pane `project-nav`): F7 a F15. Referência:
// docs/design/mod-a-painel-e-faixa.html e docs/design/mod-b-busca.html. A lista segue a barra lateral do Desktop
// (docs/SPEC.md, "Projects: the Desktop rule").

import { atom, read, update } from 'claude-code'
import type { EngineInterface, EventOf } from 'claude-code'

import type { ProjectRow, StatusFilter } from '../types'
import { homeDir } from './index'
import { writeShared } from './live'
import { Avatar, FilterPill, IconButton, PillButton, PinToggle, SEARCH_SVG } from './avatar'
import {
  filterProjects,
  PANE,
  pageOf,
  paneSections,
  projectStatusLine,
  relativeTime,
  STATUS_COLOR,
  statusCounts,
} from './model'
import { newSession, openSession } from './open'
import { THEME } from './theme'

// O scan do engine só lê atoms declarados no próprio arquivo: cada um repete os seus.
const here = atom({ plugin: 'project-nav', key: 'here' } as const, null, { shape: 'here-1' })
const projects = atom({ plugin: 'project-nav', key: 'projects' } as const, null, { shape: 'projects-1' })
const expanded = atom({ plugin: 'project-nav', key: 'expanded' } as const, {})
const sessionPage = atom({ plugin: 'project-nav', key: 'sessionPage' } as const, {})
const pins = atom({ plugin: 'project-nav', key: 'pins' } as const, {})
const query = atom({ plugin: 'project-nav', key: 'query' } as const, '')
const filter = atom({ plugin: 'project-nav', key: 'filter' } as const, 'all')

// `dot` undefined: o ponto neutro do "Todos", que segue o tema
const FILTERS: { key: StatusFilter; label: string; dot: string | undefined }[] = [
  { key: 'all', label: 'Todos', dot: undefined },
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

// Como no protótipo, o total vai no cabeçalho, ao lado de "Projetos". O título é da
// moldura do painel: abrir um id já aberto só troca o título.
export const paneTitle = (total: number | undefined) => (total ? `Projetos · ${total} no total` : 'Projetos')
let shownTitle: string | undefined

export async function openPane($: EngineInterface) {
  const view = await read($, projects)
  shownTitle = paneTitle(view?.list.length)
  await $.ui.open({ id: PANE, title: shownTitle })
  await rememberPane($, true)
}

// Depois de cada varredura: com o painel aberto e o total mudado, troca o título.
export async function retitlePane($: EngineInterface, total: number) {
  const title = paneTitle(total)
  if (title === shownTitle) return
  if (!(await $.ui.panes()).some(pane => pane.id === PANE)) return
  shownTitle = title
  await $.ui.open({ id: PANE, title })
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

  const [current, open, pages, pinned, term, status] = await Promise.all([
    read($, here),
    read($, expanded),
    read($, sessionPage),
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
    // F18: as sessões em páginas de PANE_SESSIONS
    const page = pageOf(project.sessions, pages[project.path] ?? 0)
    const turn = (to: number) => update($, sessionPage, all => ({ ...all, [project.path]: to }))
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
          {/* F9: no Desktop quem expande é o chevron. O destaque nativo do Button tem uma linha
              de altura: sobre o nome e o status (duas linhas) ele cortava a linha ao meio */}
          {/* sem Fragment: o Desktop o desenha como uma caixa própria e a linha vira coluna */}
          {Avatar(elements, project.name, project.path, 30)}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {isDesktop ? (
              <Text bold wrap="truncate-end" size="footnote">
                {project.name}
              </Text>
            ) : (
              <Button key={`name-${project.path}`} plain onPress={toggle}>
                {project.name}
              </Button>
            )}
            <Text color={subColor} dimColor={!subColor} wrap="truncate-end" size={isDesktop ? 'caption' : undefined}>
              {statusLine}
            </Text>
          </Box>
          {isDesktop ? (
            IconButton(elements, `chev-${project.path}`, toggle, <Text dimColor>{isOpen ? '▾' : '▸'}</Text>)
          ) : (
            <Button key={`chev-${project.path}`} plain dimColor label={isOpen ? '▾' : '▸'} onPress={toggle} />
          )}
          {PinToggle(elements, e.surface, `pin-${project.path}`, !!pinned[project.path], () => togglePin(project.path))}
        </Box>
        {isOpen && (
          <Box flexDirection="column" paddingLeft={isDesktop ? 3 : 4}>
            {page.rows.map(session => {
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
              // F10, Desktop: a sessão é uma caixa; no hover dela a borda arredondada aparece. O
              // clique é só o "Abrir" (PillButton), que inverte no próprio hover. A aberta aqui
              // não tem clique nem hover.
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
                    PillButton(elements, `go-${session.id}`, 'Abrir', go, `open-${session.id}`)
                  )}
                </Box>
              )
            })}
          </Box>
        )}
        {isOpen && (
          // F17 e F18: nova sessão neste projeto e, com mais de uma página, o paginador
          <Box paddingLeft={4} paddingTop={isDesktop ? 1 : 0} gap={1} alignItems="center">
            <Box flexGrow={1}>
              {/* PillButton já cai no Button de texto onde não há Svg */}
              {PillButton(elements, `new-${project.path}`, '+ Nova sessão', () => newSession($, e.surface, project.path), `new-${project.path}`)}
            </Box>
            {page.pages > 1 && (
              <Box gap={1} alignItems="center">
                {page.page > 0 ? (
                  <Button key={`prev-${project.path}`} plain dimColor label="‹" onPress={() => turn(page.page - 1)} />
                ) : (
                  <Text dimColor>{' '}</Text>
                )}
                <Text dimColor size="caption">
                  {`${page.from + 1}–${page.to} de ${project.sessions.length}`}
                </Text>
                {page.page < page.pages - 1 ? (
                  <Button key={`next-${project.path}`} plain dimColor label="›" onPress={() => turn(page.page + 1)} />
                ) : (
                  <Text dimColor>{' '}</Text>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {/* no Desktop o total está no título do painel (paneTitle); o terminal não desenha
          título com um painel só, então lá ele fica no corpo */}
      {!isDesktop && <Text dimColor size="caption">{`${view.list.length} projetos no total`}</Text>}
      {Input && (
        // o Desktop desenha o Input com largura própria: nem flexGrow nem stretch o esticam
        <Box width="100%" alignItems="center" gap={1}>
          {'Svg' in elements && isDesktop && <elements.Svg source={SEARCH_SVG} alt="Buscar" width={14} height={14} />}
          <Box flexGrow={1} flexDirection="column">
            <Input
              key="search"
              placeholder="Filtrar por nome ou pasta"
              value={term}
              onInput={value => update($, query, () => value)}
              onSubmit={value => update($, query, () => value)}
            />
          </Box>
        </Box>
      )}
      <Box columnGap={1} rowGap={0} flexWrap="wrap">
        {FILTERS.map(f => {
          const isOn = status === f.key
          const label = `${f.label} ${counts[f.key]}`
          const pick = () => update($, filter, () => f.key)
          // Desktop: a pílula arredondada do protótipo, em Svg (FilterPill)
          if (isDesktop) return FilterPill(elements, `filter-${f.key}`, f.label, counts[f.key], f.dot, isOn, pick)
          return (
            <Box key={`f-${f.key}`} gap={1} alignItems="center">
              <Text color={f.dot ?? THEME.muted}>●</Text>
              <Button
                key={`filter-${f.key}`}
                variant={isOn ? 'primary' : 'secondary'}
                label={label}
                onPress={pick}
              />
            </Box>
          )
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
