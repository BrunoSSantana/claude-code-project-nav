# Design mockups

Prototype screens the mod was built from, exported as HTML from a design tool. They are a visual reference (colors, spacing, copy), not mod code: the mod reproduces their layout and hierarchy with the Claude Code mods API elements.

| File | Screen |
| --- | --- |
| `mod-a-painel-e-faixa.html` | Mod A: projects pane and context band (collapsed and expanded) |
| `mod-b-busca.html` | Mod B: pane search and `/p` autocomplete |
| `mod-c-alerta.html` | Mod C: band alert for a session waiting on you |
| `proposta-sessoes.html` | Proposal comparing session row styles in the pane |

`mod-a-painel-e-faixa.html` depends on the design tool's runtime (`support.js`, not included), so opened on its own it shows template placeholders. The other files render standalone. The UI copy is in Brazilian Portuguese, like the mod.
