// Abrir sessões: deep link do Desktop (fase 0) ou, no terminal e sem id do Desktop,
// o plano B de copiar o comando.

import type { EngineInterface, RenderSurface } from 'claude-code'

import { sh } from './index'

let opener: string | undefined

const quote = (path: string) => `'${path.replace(/'/g, `'\\''`)}'`

async function openUrl($: EngineInterface, url: string) {
  opener ??= (await sh($, ['uname', '-s'])).text === 'Darwin' ? 'open' : 'xdg-open'
  return (await sh($, [opener, url])).ok
}

async function copyFallback($: EngineInterface, surface: RenderSurface, text: string) {
  const copied = await $.ui.copy({ text, surface })
  $.ui.toast(copied.isCopied ? `Comando copiado: ${text}` : `Rode no terminal: ${text}`)
}

export async function openSession(
  $: EngineInterface,
  surface: RenderSurface,
  session: { id: string; localId?: string },
  root: string,
) {
  if (surface === 'desktop' && session.localId) {
    if (await openUrl($, `claude://code/continue?session=${session.localId}`)) return
  }
  await copyFallback($, surface, `cd ${quote(root)} && claude --resume ${session.id}`)
}

export async function newSession($: EngineInterface, surface: RenderSurface, root: string) {
  if (surface === 'desktop') {
    if (await openUrl($, `claude://code/new?folder=${encodeURIComponent(root)}`)) return
  }
  await copyFallback($, surface, `cd ${quote(root)} && claude`)
}
