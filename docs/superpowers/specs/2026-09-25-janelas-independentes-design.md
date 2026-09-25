# Janelas de conversa independentes e bandeja

Data: 2026-09-25
Issues: #1, #2, #3, #4, #5

## Objetivo

Separar a janela de contatos (home) das conversas. Cada contato tem a própria janela de conversa,
com botão próprio na barra de tarefas (Windows) ou no Dock (mac). O app continua rodando na bandeja
quando a home é fechada, como no MSN Messenger.

## Decisões

| Tema | Decisão |
|---|---|
| Modelo de conversa | Só conversas individuais. A conversa em grupo deixa de existir. |
| Fechar a home (logado) | Esconde na bandeja; continua online. |
| Fechar a home (tela de login) | Fecha o app. |
| Mensagem de contato sem janela aberta | Abre a janela sem roubar o foco e pisca na barra de tarefas. |
| Arquitetura | Mesmo `index.html` em várias janelas; o papel vem da URL (`?chat=<id>`). |
| Fonte da verdade | Processo principal (main): rede, histórico da sessão e janelas. |

## 1. Rede e processo principal

### Envio individual (`src/main/peer-manager.ts`)

- `sendText(to, text, font)`, `sendImage(to, image)`, `sendWink(to, wink)` e `sendNudge(to)` recebem o
  id do contato e enviam só pela conexão dele.
- Contato sem conexão aberta: lança `Error('<Nome> está offline.')`.
- Cooldown de nudge e de wink passa a ser por contato (`Map<id, timestamp>`).
- O protocolo não muda. Quem recebe identifica o remetente pelo `from`. Contatos em versões antigas,
  que enviam para todos, continuam funcionando: a mensagem cai na janela do remetente.

### Histórico da sessão (`src/main/conversations.ts`, novo)

- Guarda em memória, por id de contato, a lista de itens da conversa: texto, imagem (com os bytes),
  wink, nudge e avisos do sistema ("entrou", "saiu").
- Teto de 200 itens por contato; ao passar, descarta os mais antigos.
- `clear()` no logout. Nada é gravado em disco.
- Serve para a janela recém-aberta carregar o que já chegou e para reabrir uma conversa fechada.

### Gerente de janelas (`src/main/chat-windows.ts`, novo)

- Cuida só das janelas de conversa: um `Map<idContato, BrowserWindow>`. A janela principal (login/home)
  continua no `main.ts`.
- `openChat(id, { focus })`: se a janela existe, mostra e (com `focus`) foca; se não, cria. Com
  `focus: false`, usa `showInactive()` e `flashFrame(true)`. O piscar para quando a janela ganha foco.
- Roteamento de eventos da rede:
  - mensagem, imagem, wink e nudge → janela do contato. Se ela não existir, abre sem foco.
  - presença e avatar → home e janela daquele contato, se aberta.
  - nudge → sacode só a janela da conversa do remetente.
- Evento de contato desconhecido (sem hello) é ignorado e não abre janela.
- Rajada de mensagens de um contato sem janela abre uma única janela; as demais ficam no histórico.
- Recebe uma fábrica de janelas injetada, para ser testado sem Electron.
- O `main.ts` delega a esses módulos o que hoje faz sobre janela e envio.

## 2. Bandeja e ciclo de vida

### Ícone da bandeja

- Borboleta em PNG (gerada uma vez do SVG por `scripts/make-tray-icons.mjs` e versionada em
  `public/tray/`). No mac, imagem template monocromática.
- Dica: `Chat Live Messenger – <nome> (<status>)`, ou `Chat Live Messenger` fora de sessão.
  Com atualização pronta, acrescenta `– Atualização disponível`.
- Clique (Windows): mostra e foca a home. No mac o clique abre o menu.
- Menu: "Abrir Chat Live Messenger" e "Sair".

### Fechar, minimizar e sair

| Janela | Logado | Tela de login |
|---|---|---|
| Home | Esconde. Na primeira vez da sessão do app, notificação do sistema: "O Chat continua rodando na bandeja." | Fecha o app. |
| Conversa | Fecha só ela; o histórico fica no main. | — |

- Minimizar: cada janela vai sozinha para a barra de tarefas/Dock.
- Sair de verdade: "Sair" da bandeja, Cmd+Q ou "Encerrar" no Dock (mac) e "Atualizar" do auto-update.
  Todos passam por `before-quit`, que marca `quitting = true`. Com a marca, o fechar da home não é
  interceptado. O logout limpo atual (aviso via mDNS) continua.
- Sair da conta (menu de status → "Sair"): fecha todas as conversas, limpa o histórico e a home volta
  ao login.
- mac: `activate` (clique no Dock) mostra a home escondida.
- A barra de atualização continua só na home; o app não abre a home sozinho por causa dela.

## 3. Renderer

### Papel da janela

- `src/renderer.ts` lê `location.search`:
  - sem parâmetro: janela principal, com login e home;
  - `?chat=<id>`: janela de conversa daquele contato.
- Cada janela mostra uma única tela. `showView` deixa de alternar entre as três.

### Home

- Duplo clique ou Enter num contato abre a conversa dele (IPC `openChat(id)`).
- Removidos: linha/botão "Conversa em grupo", contador de não lidas do grupo, item de menu
  "Abrir conversa em grupo" e toasts de mensagem na home.
- Contato offline pode ter a conversa aberta para ler o histórico.

### Janela de conversa

- Título da janela: `<nome> – Conversa` (aparece no botão da barra de tarefas).
- Cabeçalho com nome, status, mensagem pessoal e avatar do contato, no lugar do cabeçalho de grupo.
- Removidos: botões "Contatos" e "Convidar".
- Barra de título própria com minimizar, maximizar e fechar (a atual, reaproveitada).
- Ao abrir, assina os itens novos, pede ao main o histórico, renderiza o histórico e depois os itens que chegaram no meio, sem repetir (pelo `seq`).
- Contato offline: campo de envio desativado com o aviso "<nome> está offline". Reativa quando ele
  volta.
- Avisos "entrou" e "saiu" só na conversa daquele contato.
- Emoticons, winks, GIFs, fonte, imagens, arrastar e soltar e "chamar atenção" continuam, agora só
  para esse contato.

### Estado entre janelas

- Avatar, fonte e perfil vêm do main por IPC.
- Mudança de fonte numa janela é avisada às outras por um evento novo (`font:changed`).

## 4. Erros

- Envio para contato offline ou que caiu durante o envio: o main rejeita com "<nome> está offline.";
  a conversa mostra o aviso e o texto digitado permanece no campo.
- Contato some com a janela aberta: aviso "<nome> saiu" e envio desativado; volta com "<nome> entrou".
- Evento de contato desconhecido: ignorado.
- Nudges em sequência: a janela treme uma vez por vez (como hoje); o cooldown de quem envia continua.

## 5. Testes

Automatizados (vitest):

- `peer-manager`: envio individual chega só ao contato alvo e não a um terceiro conectado; contato
  offline gera erro; cooldown de nudge/wink é por contato.
- `conversations`: acumula por contato, respeita o teto de 200 itens, `clear()` esvazia tudo.
- `windows` (fábrica falsa): evento sem janela abre sem foco; evento com janela reaproveita;
  rajada abre uma única janela; contato desconhecido não abre janela; presença vai para home e conversa.

Manual (Mac + outro computador na LAN):

- Duas conversas abertas ao mesmo tempo, cada uma com seu botão na barra/Dock.
- Minimizar e fechar uma conversa sem afetar a outra nem a home.
- Fechar a home e continuar recebendo mensagens (janela abre sem foco e pisca).
- "Sair" pela bandeja encerra o app.

No Windows, a validação é feita com o release gerado pelo CI.

## Fora do escopo

Conversa em grupo, histórico em disco, troca de status pelo menu da bandeja, notificações visual e
sonora (#6, #7) e iniciar junto com o sistema.
