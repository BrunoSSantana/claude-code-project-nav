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

// "Abrir" clicável: a pílula desenhada e, por cima, um Button em branco recortado no tamanho
// dela, então o destaque nativo do hover fica só sobre a pílula. O Button vai numa camada
// mais larga que a pílula (encolhido, o Desktop corta com "…" visível) e quem o corta é a
// caixa da pílula, com `overflow="hidden"`. No hover dela a pílula inverte (grupo `scope`).
const PILL_CELLS = 30

export function PillButton(elements: Elements, key: string, text: string, onPress: () => void, scope: string) {
  const { Box, Button } = elements
  if (!('Svg' in elements)) return <Button key={key} plain label={text} onPress={onPress} />
  return (
    <Box key={`${key}-wrap`} position="relative" hover={{ scope }}>
      {Pill(elements, text)}
      <Box position="absolute" top={0} left={0} display="none" hover={{ scope, display: 'flex' }}>
        {Pill(elements, text, true)}
      </Box>
      <Box position="absolute" top={0} left={0} right={0} bottom={0} overflow="hidden">
        <Box position="absolute" top={0} bottom={0} left={0} width={PILL_CELLS}>
          <Button key={key} plain onPress={onPress}>
            {BLANK.repeat(PILL_CELLS)}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

// Botão de ícone: o Svg fica embaixo, centralizado numa caixa fixa (3 colunas, 1 linha), e um
// Button em branco vem por cima, recortado por ela. O Desktop desenha o Svg inline: com ele
// por cima, era o Svg que recebia o mouse, e o Button não acendia nem recebia o clique.
// A camada do Button é mais larga que a caixa (encolhido, o Desktop corta com "…" visível).
const ICON_CELLS = 10

export function IconButton(elements: Elements, key: string, onPress: () => void, icon: RenderChildren) {
  const { Box, Button } = elements
  return (
    <Box key={`${key}-wrap`} position="relative" width={3} height={1} alignItems="center" justifyContent="center">
      {icon}
      <Box position="absolute" top={0} left={0} right={0} bottom={0} overflow="hidden">
        <Box position="absolute" top={0} bottom={0} left={0} width={ICON_CELLS}>
          <Button key={key} plain onPress={onPress}>
            {BLANK.repeat(ICON_CELLS)}
          </Button>
        </Box>
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

// Pílula de filtro do protótipo (mod-a-painel-e-faixa.html, linha 111): raio total, borda de
// 1px, ponto de status, rótulo e contagem mais apagada. O Box não tem raio: é um Svg, com o
// Button em branco por cima recortado por ela. Ativa: contraste máximo, como a "Todos 19".
// Cores claras nos atributos, escuras em svgDark (o Svg não lê as variáveis do tema).
const FILTER = {
  light: { line: '#D4D4D8', fg: '#3F3F46', onBg: '#1F1F24', onFg: '#FFFFFF', dot: '#71717A' },
  dark: { line: '#3A3A42', fg: '#C9C9CF', onBg: '#ECECEE', onFg: '#141416', dot: '#8B8B93' },
} as const
const FILTER_HEIGHT = 24
// largura média de um caractere do Inter a 12px
const charWidth = (text: string) => text.length * 7

const escapeXml = (text: string) => text.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`)

// `dot` undefined: o ponto neutro do "Todos", que na pílula ativa vira a cor do texto
export const filterPillSvg = (label: string, count: number, dot: string | undefined, isOn: boolean) => {
  const h = FILTER_HEIGHT
  const pad = 11
  const dotSize = 7
  const textX = pad + dotSize + 6
  const countText = String(count)
  const width = Math.round(textX + charWidth(label) + 5 + charWidth(countText) + pad)
  const { light, dark } = FILTER
  const pick = (c: (typeof FILTER)['light' | 'dark']) =>
    isOn ? { bg: c.onBg, line: c.onBg, fg: c.onFg, dot: dot ?? c.onFg } : { bg: 'none', line: c.line, fg: c.fg, dot: dot ?? c.dot }
  const l = pick(light)
  const d = pick(dark)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">`,
    svgDark(`.bg{fill:${d.bg};stroke:${d.line}}.fg{fill:${d.fg}}.dot{fill:${d.dot}}`),
    `<rect class="bg" x="0.5" y="0.5" width="${width - 1}" height="${h - 1}" rx="${(h - 1) / 2}" fill="${l.bg}" stroke="${l.line}"/>`,
    `<circle class="dot" cx="${pad + dotSize / 2}" cy="${h / 2}" r="${dotSize / 2}" fill="${l.dot}"/>`,
    `<text class="fg" x="${textX}" y="50%" dy="0.35em" font-family="Inter, system-ui, sans-serif" font-size="12"`,
    ` font-weight="500" fill="${l.fg}">${escapeXml(label)}<tspan dx="5" fill-opacity="0.75">${countText}</tspan></text>`,
    '</svg>',
  ].join('')
  return { svg, width, height: h }
}

const FILTER_CELLS = 30

export function FilterPill(
  elements: Elements,
  key: string,
  label: string,
  count: number,
  dot: string | undefined,
  isOn: boolean,
  onPress: () => void,
) {
  const { Box, Button } = elements
  if (!('Svg' in elements)) return <Button key={key} plain label={`${label} ${count}`} onPress={onPress} />
  const { Svg } = elements
  const pill = filterPillSvg(label, count, dot, isOn)
  return (
    <Box key={`${key}-wrap`} position="relative">
      <Svg source={pill.svg} alt={`${label} ${count}`} width={pill.width} height={pill.height} />
      <Box position="absolute" top={0} left={0} right={0} bottom={0} overflow="hidden">
        <Box position="absolute" top={0} bottom={0} left={0} width={FILTER_CELLS}>
          <Button key={key} plain onPress={onPress}>
            {BLANK.repeat(FILTER_CELLS)}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

// Lupa do campo de busca do protótipo (linha 105).
export const SEARCH_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"',
  ' stroke="#71717A" stroke-width="2.2" stroke-linecap="round">',
  svgDark('svg{stroke:#8B8B93}'),
  '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  '</svg>',
].join('')
