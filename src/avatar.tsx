// Avatar do projeto: quadrado arredondado com as iniciais (docs/SPEC.md, "Where the mod draws").
// No Desktop é um Svg, como no protótipo; no terminal, que não tem Svg, um Text com fundo.

import type { EventOf } from 'claude-code'
import type { EngineInterface, RenderChildren } from 'claude-code'

import { avatarColor, initials } from './model'
import { svgDark } from './theme'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

const svgFor = (letters: string, color: string, size: number) => {
  const radius = Math.round(size / 4)
  const font = Math.round(size * 0.42)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${color}"/>`,
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Inter, system-ui, sans-serif"`,
    ` font-size="${font}" font-weight="700" fill="#141416">${letters}</text>`,
    '</svg>',
  ].join('')
}

export function Avatar(elements: Elements, name: string, path: string, size = 24) {
  const letters = initials(name).trim().replace(/[^A-Z0-9]/g, '')
  const color = avatarColor(path)
  if ('Svg' in elements) {
    const { Svg } = elements
    return <Svg source={svgFor(letters, color, size)} alt={name} width={size} height={size} />
  }
  const { Text } = elements
  return (
    <Text backgroundColor={color} color="#141416" bold>
      {` ${letters.padEnd(2, ' ')} `}
    </Text>
  )
}

// Chip de texto com fundo (contadores, branch): Box com fundo e respiro lateral.
export function Chip(elements: Elements, text: string, colors: { bg: string; fg: string }, mono = false) {
  const { Box, Text } = elements
  return (
    <Box backgroundColor={colors.bg} paddingX={1}>
      <Text color={colors.fg} bold={!mono} mono={mono}>
        {text}
      </Text>
    </Box>
  )
}

export type RenderEvent = EventOf['ui.render']

// O Button do Desktop só desenha texto, sem cor nem negrito próprios. Para um controle com
// a cara do protótipo (ícone, pílula colorida, nome em negrito), o conteúdo é desenhado
// por baixo e um Button sem chrome, de texto em branco, fica por cima recebendo o clique.
// Sem `label`: o Desktop desenha o label como texto visível, por cima do conteúdo.
// No terminal, onde o Button pinta as próprias células, fica o Button de texto comum.
const BLANK = '⠀'

export function Pressable(
  elements: Elements,
  surface: string,
  key: string,
  label: string,
  onPress: () => void,
  content: RenderChildren,
  cells: number,
  fallback?: RenderChildren,
) {
  const { Box, Button } = elements
  if (surface !== 'desktop') return fallback ?? <Button key={key} plain label={label} onPress={onPress} />
  return (
    <Box key={`${key}-wrap`} position="relative">
      {content}
      <Box position="absolute" top={0} left={0}>
        <Button key={key} plain onPress={onPress}>
          {BLANK.repeat(Math.max(1, cells))}
        </Button>
      </Box>
    </Box>
  )
}

// Linha clicável inteira: um Button em branco de várias linhas numa camada por cima, mais
// largo que a linha. A camada tem largura própria, para o Button não encolher (encolhido, o
// Desktop corta com "…" visível); quem a corta é a linha, com `overflow="hidden"`.
const ROW_CELLS = 200

export function RowPress(elements: Elements, key: string, onPress: () => void, lines = 2) {
  const { Box, Button } = elements
  return (
    <Box position="absolute" top={0} left={0} width={ROW_CELLS}>
      <Button key={key} plain onPress={onPress}>
        {Array.from({ length: lines }, () => BLANK.repeat(ROW_CELLS)).join('\n')}
      </Button>
    </Box>
  )
}

// Pílula arredondada (o "Abrir" do protótipo): o Box não tem raio, então é um Svg.
// Invertida (contraste máximo) é a do hover. Cores claras nos atributos, escuras em svgDark.
const PILL = {
  light: { bg: '#EAEAED', fg: '#3F3F46', invBg: '#1F1F24', invFg: '#FFFFFF' },
  dark: { bg: '#2E2E36', fg: '#C9C9CF', invBg: '#ECECEE', invFg: '#141416' },
} as const

const pillSvg = (text: string, width: number, isInverted: boolean) => {
  const pick = (c: { bg: string; fg: string; invBg: string; invFg: string }) => (isInverted ? { bg: c.invBg, fg: c.invFg } : { bg: c.bg, fg: c.fg })
  const light = pick(PILL.light)
  const dark = pick(PILL.dark)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20">`,
    svgDark(`.bg{fill:${dark.bg}}.fg{fill:${dark.fg}}`),
    `<rect class="bg" width="${width}" height="20" rx="10" fill="${light.bg}"/>`,
    `<text class="fg" x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Inter, system-ui, sans-serif"`,
    ` font-size="11.5" font-weight="${isInverted ? 600 : 400}" fill="${light.fg}">${text}</text>`,
    '</svg>',
  ].join('')
}

export function Pill(elements: Elements, text: string, isInverted = false) {
  const width = Math.round(text.length * 6.5 + 22)
  if ('Svg' in elements) {
    const { Svg } = elements
    return <Svg source={pillSvg(text, width, isInverted)} alt={text} width={width} height={20} />
  }
  const { Text } = elements
  return <Text dimColor>{text}</Text>
}

// Botão de ícone: aqui o Button em branco fica no fluxo e define o tamanho e o destaque
// do hover; o Svg vem por cima, centralizado nele. Com o Button por cima (Pressable),
// o destaque saía mais largo que o ícone e deslocado para a direita.
export function IconButton(elements: Elements, key: string, onPress: () => void, icon: RenderChildren) {
  const { Box, Button } = elements
  return (
    <Box key={`${key}-wrap`} position="relative">
      <Button key={key} plain onPress={onPress}>
        {BLANK.repeat(2)}
      </Button>
      <Box position="absolute" top={0} left={0} right={0} bottom={0} alignItems="center" justifyContent="center">
        {icon}
      </Box>
    </Box>
  )
}

// Alfinete do protótipo (mod-a-painel-e-faixa.html): laranja e preenchido quando fixado.
const pinSvg = (isPinned: boolean) => {
  const color = isPinned ? '#E8915F' : '#6B6B73'
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"`,
    ` stroke="${color}" stroke-width="2" stroke-linejoin="round">`,
    `<path d="M9 3h6l-1 6 4 4H6l4-4z" fill="${isPinned ? color : 'none'}"/>`,
    '<path d="M12 13v8"/>',
    '</svg>',
  ].join('')
}

// Grade 2×2 da faixa (F5): abre e fecha o painel. O glifo ▦ fica só no terminal.
const GRID_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"',
  ' stroke="#52525B" stroke-width="2" stroke-linejoin="round">',
  svgDark('svg{stroke:#C9C9CF}'),
  '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>',
  '<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  '</svg>',
].join('')

export function GridToggle(elements: Elements, surface: string, key: string, onPress: () => void) {
  const label = 'Projetos'
  if (!('Svg' in elements) || surface !== 'desktop') {
    const { Button } = elements
    return <Button key={key} variant="secondary" label="▦" onPress={onPress} />
  }
  const { Svg } = elements
  return IconButton(elements, key, onPress, <Svg source={GRID_SVG} alt={label} width={16} height={16} />)
}

export function PinToggle(elements: Elements, surface: string, key: string, isPinned: boolean, onPress: () => void) {
  const label = isPinned ? 'Desafixar' : 'Fixar'
  if (!('Svg' in elements) || surface !== 'desktop') {
    const { Button } = elements
    return <Button key={key} plain dimColor={!isPinned} label={isPinned ? '★' : '☆'} onPress={onPress} />
  }
  const { Svg } = elements
  return IconButton(elements, key, onPress, <Svg source={pinSvg(isPinned)} alt={label} width={15} height={15} />)
}
