# Fontes do Google Fonts no "Alterar fonte"

Data: 2026-09-25

## Decisões

| Tema | Decisão |
|---|---|
| Catálogo | Snapshot do catálogo do Google (`fonts.google.com/metadata/fonts`) só com famílias que têm o subconjunto `latin`, em `src/shared/google-fonts.json` (nome, categoria, pesos, itálico). Vai dentro do app: lista e busca funcionam offline. Gerado por `scripts/update-google-fonts.mjs`. |
| Favoritas | As 20 mais populares do catálogo (campo `popularity`). Arquivos woff2 (subconjuntos `latin` e `latin-ext`) embutidos em `public/fonts/<slug>/` com `public/fonts/manifest.json`. Funcionam sem internet. |
| Demais fontes | Baixadas sob demanda pelo main (`fonts.googleapis.com/css2` + `fonts.gstatic.com`) quando escolhidas ou recebidas; guardadas em `userData/fonts/<slug>/` com `manifest.json`. Da segunda vez, offline. |
| Sem a fonte | Enquanto baixa ou sem internet: fonte parecida da mesma categoria (`sans-serif`, `serif`, `cursive`, `monospace`). |
| Clássicas | As 12 fontes de hoje continuam, numa seção própria. |
| Peso | Lista só com os pesos que a família tem (Fina 100 … Preta 900) + caixa "Itálico" (desativada se a família não tem itálico). Substitui "Normal / Itálico / Negrito / Negrito itálico". |
| Busca | Campo de busca acima da lista de fontes; filtra por nome sem diferenciar maiúsculas nem acentos. |

## Protocolo

- `MessageFont.family` passa a ser `string` validada contra "clássicas ∪ catálogo".
- Novo `MessageFont.weight` (100–900, múltiplo de 100). `bold` continua sendo enviado (`weight >= 600`) para
  versões antigas. Mensagem sem `weight` (versão antiga) usa `bold ? 700 : 400`.
- Versões antigas recebem família do Google como fonte inválida: a mensagem chega sem formatação (já é o
  comportamento de `parseMessage`).

## Main

- `FontCache` (`src/main/font-cache.ts`): `ensure(family)` devolve as faces (`{ weight, style, unicodeRange, url }`).
  Favorita → manifesto embutido (URL relativa `fonts/<slug>/<arquivo>`). Outra → manifesto em disco, ou baixa:
  CSS2 com todos os pesos/itálicos do catálogo, só blocos `latin`/`latin-ext`, só `https://fonts.gstatic.com/`,
  até 2 MB por arquivo e 12 MB por família, arquivos nomeados por hash da URL. Um download por família por vez.
- Protocolo interno `chatfont://cache/<slug>/<arquivo>` serve só arquivos dentro de `userData/fonts`.
- CSP ganha `font-src 'self' chatfont:`.
- IPC `font:ensure` (família do catálogo) → faces.

## Renderer

- `font-loader.ts`: `fontStack(family)` e `ensureFontLoaded(family)` (registra com a API `FontFace`, uma vez
  por família). `applyFont` usa a pilha e o peso e dispara o carregamento sem esperar.
- Diálogo: busca, seções "★ Favoritas", "Clássicas do sistema", "Google Fonts"; lista de pesos; "Itálico";
  aviso "Baixando fonte…" / "Sem internet: vai aparecer numa fonte parecida.".

## Testes

Catálogo (favoritas existem, pesos, busca), validação de fonte (catálogo, peso, legado), `FontCache` com
`fetch` falso (parse do CSS, filtro latin, domínio, limite, cache, dedupe, nomes), manual com duas instâncias.

## Fora do escopo

Favoritas escolhidas pelo usuário, outros alfabetos além de latin, fontes locais instaladas no sistema.
