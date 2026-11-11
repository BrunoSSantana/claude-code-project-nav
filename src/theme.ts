// Cores que seguem o tema da pessoa. Box e Text recebem chaves de tema: o Desktop as traduz
// para as variáveis CSS do próprio tema (claro ou escuro) e o terminal para o tema dele.
// Hex fixo só onde a cor vale nos dois temas (pontos de status, avatares).
export const THEME = {
  // fundo de destaque (projeto aberto, pílula de filtro, chips): o mesmo da mensagem do usuário
  surface: 'userMessageBackground',
  // bordas neutras (separadores, hover da sessão)
  border: 'subtle',
  text: 'text',
  muted: 'inactive',
  // pílula ativa: fundo na cor do texto, texto invertido
  inverseBg: 'text',
  inverseText: 'inverseText',
  waiting: 'warning',
  running: 'suggestion',
} as const

// Svg é desenhado como imagem: não lê as variáveis do tema. O Desktop põe o tema escolhido
// em `nativeTheme.themeSource`, então `prefers-color-scheme` dentro do Svg segue o tema do app.
// As cores claras ficam nos atributos; este bloco as troca no tema escuro.
export const svgDark = (css: string) => `<style>@media (prefers-color-scheme: dark){${css}}</style>`
