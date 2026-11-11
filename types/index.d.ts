export type Status = 'waiting' | 'running' | 'idle'

// Uma sessão de um projeto, como a faixa e o painel a mostram.
export type SessionRow = {
  id: string
  // id do Desktop (local_…), quando a sessão existe no app: é o que o deep link abre
  localId?: string
  title: string
  branch?: string
  lastActivity: number
  status: Status
}

// A sessão aberta aqui.
export type Here = {
  id: string
  root: string
  name: string
  title: string
  // undefined fora de um repositório git ou em HEAD destacado
  branch?: string
}

// Um projeto como a barra lateral do Desktop o agrupa (docs/SPEC.md, "Projects: the Desktop rule").
export type ProjectRow = {
  // originCwd || cwd das sessões do grupo: a chave do projeto
  path: string
  name: string
  status: Status
  lastActivity: number
  sessionCount: number
  runningCount: number
  // todas, já na ordem F15; o painel pagina (F10, F18)
  sessions: SessionRow[]
}

export type Projects = {
  // path do projeto desta sessão
  current: string
  list: ProjectRow[]
}

// O estado que uma sessão com o mod publica para as outras (fase 3, live.ts).
export type LiveEntry = {
  sessionId: string
  // id do Desktop (local_…), quando a sessão existe no app
  localId?: string
  projectPath: string
  title: string
  branch?: string
  status: Status
  // por que aguarda: ferramenta e resumo do comando
  reason?: string
  updatedAt: number
}

export type StatusFilter = 'all' | Status

declare module 'claude-code' {
  interface PluginState {
    'project-nav': {
      here: Shaped<Here | null>
      sessions: Shaped<SessionRow[]>
      bandOpen: boolean
      projects: Shaped<Projects | null>
      // projetos abertos ou fechados no painel; ausente, só o atual fica aberto
      expanded: Record<string, boolean>
      // página de sessões aberta em cada projeto (F18); ausente, a primeira
      sessionPage: Record<string, number>
      // espelho de nav:pins no $.store
      pins: Record<string, boolean>
      // as outras sessões com o mod, lidas a cada 5 s (F2, F6)
      others: Shaped<LiveEntry[]>
      // alertas dispensados com "Depois": sessionId -> reasonHash (F6)
      dismissed: Record<string, string>
      // busca e filtro do painel (F12, F13)
      query: string
      filter: StatusFilter
    }
  }
}
