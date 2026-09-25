# Notificações de nova mensagem e conversa centralizada

Data: 2026-09-25
Issues: #6 (notificação visual), #7 (notificação sonora)

## Decisões

| Tema | Decisão |
|---|---|
| Destaque na barra | `flashFrame(true)` a cada item recebido com a conversa fora de foco (minimizada, atrás de outra janela ou recém-aberta sozinha). No Windows pisca e fica laranja até focar; no mac o ícone pula no Dock. Some ao focar. |
| Contato na lista | Pulso laranja no contato da home enquanto a conversa dele tiver item não visto (chegou fora de foco). Some ao focar ou fechar a conversa. |
| Quando toca o som | Cada mensagem, imagem ou wink **recebido** com a conversa fora de foco. Mensagem própria não toca. Nudge mantém o som próprio. No máximo um som por segundo. |
| Arquivo do som | `public/sounds/message.wav` (ou `.mp3`/`.ogg`) se existir; senão "plim" sintetizado em dois tons. O som original do MSN não vem com o projeto. |
| Silenciar | Item "Sons de mensagem" com ✓ no menu ☰ da home; salvo em `settings.json` (`sounds`, padrão ligado); vale para todas as janelas na hora. |
| Conversa | Padding horizontal na lista de mensagens: `clamp(16px, 6vw, 56px)`. |

## Main

- `ChatWindows` guarda o conjunto de contatos com item não visto. `receive()` marca como não visto quando a
  janela do contato não está em foco. A fábrica de janelas avisa foco e fechamento; os dois limpam a marca.
  Mudanças vão para a home por `chat:unread-changed`; a home lê o estado inicial por `chat:unread`.
- `Settings.sounds: boolean` (padrão `true`), com `sound:get`, `sound:set` e o aviso `sound:changed` para
  todas as janelas.

## Renderer

- Janela de conversa: decide tocar o som com uma regra pura (`shouldPlayMessageSound`) que considera tipo do
  item, remetente, se o item é novo (ao vivo ou do histórico há menos de 10 s), foco da janela
  (`document.hasFocus()`), opção de som e intervalo mínimo de 1 s.
- Home: classe `is-unread` no contato; animação de pulso laranja (estática com `prefers-reduced-motion`).
  Menu ☰ ganha "Sons de mensagem" com ✓ quando ligado.

## Testes

- `ChatWindows`: não visto ao receber fora de foco; não marca em foco; foco e fechamento limpam; avisos só em
  mudança real; `unreadIds()`.
- `shouldPlayMessageSound`: cada condição.
- `SettingsStore`: `sounds` salvo, padrão `true` para arquivo antigo.
- Manual com duas instâncias.

## Fora do escopo

Escolher o som pelo app, volume, som diferente por contato.
