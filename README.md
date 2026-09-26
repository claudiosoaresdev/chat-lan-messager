# Chat LAN

Chat desktop que funciona só pela rede local (Wi-Fi/LAN), sem internet e sem servidor. Cada app descobre os outros via mDNS e troca texto e imagens direto, peer-to-peer, por WebSocket.

> ⚠️ O tráfego **não é criptografado** no MVP. Use só em redes confiáveis.

## Rodar

```bash
npm install
npm start
```

| Script              | O que faz                                                     |
| ------------------- | ------------------------------------------------------------- |
| `npm start`         | App em modo dev                                               |
| `npm test`          | Testes (Vitest): protocolo e lógica de peers                  |
| `npm run typecheck` | `tsc --noEmit`                                                |
| `npm run lint`      | ESLint                                                        |
| `npm run make`      | Instaladores: `.dmg`/`.zip` no Mac, `Setup.exe` no Windows    |

Os instaladores saem em `out/make/`.

### Windows

| Como                                  | Onde rodar     | Resultado                                                                 |
| ------------------------------------- | -------------- | ------------------------------------------------------------------------- |
| `npm run make` (instalador)           | No Windows     | `out/make/squirrel.windows/x64/ChatLAN-Setup.exe`; cria atalho na Área de Trabalho e no Menu Iniciar |
| `npm run make:win` (portátil, `.zip`) | Mac ou Windows | `out/make/zip/win32/x64/Chat LAN-win32-x64-1.0.0.zip`; sem instalação     |

O instalador Squirrel não sai do Mac sem Wine e Mono; a versão portátil sai. No portátil, extraia o `.zip` inteiro (o `chat-lan.exe` precisa das DLLs e da pasta `resources` ao lado) e crie o atalho à mão: botão direito em `chat-lan.exe` → **Mostrar mais opções** → **Enviar para** → **Área de trabalho (criar atalho)**.

## Como usar

O visual segue o do projeto MSN (`../msn`): janela sem moldura com barra de título azul, fundo em gradiente azul-céu e controles no estilo Windows clássico.

1. **Tela de entrada** ("Entrar no Chat LAN"). No lugar de e-mail e senha:
   - **Seu nome**: o nome que os outros veem (vem preenchido com o nome do computador).
   - **Conectar a (opcional)**: `IP:porta` de outro computador. Em branco, os contatos da rede são encontrados sozinhos via mDNS.
   - **Seu endereço**: o `IP:porta` deste computador (clique para copiar), para passar a quem precisar conectar por IP.
   - **Entrar como**: Disponível, Ausente ou Ocupado.
   - **Lembrar minhas informações** / **Entrar automaticamente**, e em **Opções** a porta deste computador.
2. **Contatos**: você no topo (status, mensagem pessoal e endereço), busca, grupos **Online** e **Offline** com status e mensagem pessoal de cada um. O botão com o boneco e o **+** adiciona um contato por IP e mostra os endereços salvos (o **×** esquece um).
3. **Conversas**: as mensagens aparecem no formato "Fulano diz:". Imagens (PNG, JPEG, WebP, GIF até 10 MB) vão pelo botão **Imagem**, arrastando para a conversa ou colando com Ctrl/Cmd+V.
4. **Chamar atenção** (botão na barra da conversa ou ao lado do de imagem): a janela do contato treme e toca um som, como no MSN. Um a cada 5 s; chamadas repetidas do mesmo contato nesse intervalo são ignoradas.
   - **Som original do MSN:** ele não vem com o projeto (é da Microsoft). Se você tiver o arquivo, coloque em `public/sounds/nudge.wav` (ou `nudge.mp3` / `nudge.ogg`) e rode o app ou o `npm run make` de novo: ele passa a ser usado e vai junto no instalador. Sem o arquivo, o app toca um chacoalhar sintetizado parecido.
5. **Imagem de exibição**: clique no seu avatar (no login, na lista ou na conversa) para abrir a janela "Imagem de exibição", com a grade de imagens e o **Procurar...** para enviar uma do computador (recortada em quadrado 128×128). Ela vai para os contatos e aparece na lista (miniatura com moldura na cor do status) e na conversa.
   - **Imagens padrão** vêm de `public/avatars/`: qualquer PNG, JPEG, WebP, GIF ou SVG colocado lá aparece na grade (o nome do arquivo vira o título; `01-girassol.svg` → "Girassol").
   - **Imagens enviadas** ficam na pasta de dados do app (`avatars/uploads`, as 24 mais recentes); a atual fica em `avatars/current`.
6. **Alterar fonte**: o botão **A** na barra da caixa de escrever abre a janela "Alterar fonte" (fonte, peso, itálico, tamanho, sublinhado e cor). A fonte vai junto com cada mensagem, então os contatos veem suas mensagens nela, como no MSN; a escolha fica salva.
   - **Busca** no topo da lista e três seções: **★ Favoritas** (as 20 mais populares do Google Fonts, que vêm dentro do app e funcionam sem internet), **Clássicas do sistema** e **Google Fonts** (todas as ~1.800 fontes latinas).
   - As fontes do Google que não são favoritas são baixadas na primeira vez que você escolhe ou recebe uma, e ficam guardadas no computador. Para isso precisa de internet nos dois lados; sem internet a mensagem aparece numa fonte parecida. Fontes recebidas baixam no máximo 20 novas por hora.
   - **Peso**: só os pesos que a fonte tem (Fina 100 … Preta 900), mais a opção **Itálico** quando a fonte tem.
   - Quem usa uma versão antiga recebe a mensagem na fonte padrão. Para atualizar o catálogo e as favoritas: `node scripts/update-google-fonts.mjs`.
7. **Emoticons**: atalhos como `:)`, `:D`, `;)`, `:P`, `(H)`, `(Y)`, `(L)`/`<3`, `(C)` viram emoticons nas mensagens, nas mensagens pessoais e nos avisos. A carinha na barra da caixa de escrever abre a grade com os 35 emoticons (passe o mouse para ver o atalho). Os desenhos são próprios (não as imagens originais do MSN) e o texto viaja como atalho, então funciona com qualquer versão do app.
8. **Divisor da conversa**: arraste a faixa pontilhada entre a conversa e a caixa de texto para aumentar uma ou outra (setas ↑/↓ com o divisor em foco; clique duplo volta ao padrão). O tamanho fica lembrado.
9. **Winks**: o botão **Winks** abre a grade com 6 animações (Beijo, Corações, Risada, Fogos, Parabéns e Chuva de estrelas) que tocam na janela daquela conversa, com som, como no MSN. Se a conversa estiver fechada, a janela abre e o wink toca nela; "Ver de novo" repete. Um a cada 3 s. As animações são próprias (SVG + CSS); os winks originais eram animações Flash da Microsoft.
10. **GIFs do GIPHY** (opcional, precisa de internet): o botão **GIF** abre a busca. Na primeira vez, cole uma API Key gratuita criada em [developers.giphy.com](https://developers.giphy.com/dashboard/) (fica salva só neste computador). A busca e o download são feitos pelo processo principal (a interface continua sem acesso à internet) e o GIF escolhido vai como imagem pela rede local, então quem recebe não precisa de internet. Sem internet ou sem chave, o resto do app funciona igual.
11. Mensagem chegando fora da conversa gera um aviso no canto da janela e, com a janela em segundo plano, uma notificação do sistema.

A rede (servidor, mDNS e reconexões) só sobe depois de **Entrar** e é derrubada em **Sair**. IPs conectados ficam salvos e reconectam sozinhos a cada 3 s enquanto o outro estiver fechado.

### Conversas e bandeja

- Clique duas vezes num contato para abrir a conversa com ele. Cada conversa tem a própria janela e o
  próprio botão na barra de tarefas (Windows) ou no Dock (mac).
- As mensagens vão só para aquele contato. Não existe mais a conversa em grupo.
- Chegou mensagem de alguém cuja conversa está fechada? A janela abre sem roubar o foco e pisca na
  barra de tarefas.
- Fechar a lista de contatos não sai do app: ele continua online na bandeja (ou na barra de menus do
  mac). Para sair, use **Sair** no menu do ícone da borboleta.
- O histórico da conversa vale enquanto o app estiver aberto; ao sair, ele some (como no MSN).
- Mensagem nova com a conversa fora de foco: o botão da conversa pisca e fica laranja na barra de tarefas,
  o contato pisca na lista e toca um som. Para desligar o som, use **Sons de mensagem** no menu ☰.
- Para usar os sons originais do MSN, coloque `message.wav` (nova mensagem) e `nudge.wav` (chamar atenção)
  em `public/sounds/` antes de gerar o app.

### Aparência

No menu ☰ da lista de contatos, **Aparência...** abre a janela de modo e temas:

- **Modo**: Sistema (segue o macOS/Windows na hora), Claro ou Escuro.
- **Tema**: Azul clássico (o visual original), Verde, Rosa, Roxo, Laranja, Menta, Vermelho e Grafite, cada um
  com versão clara e escura. O tema traz a cor e uma fonte sugerida para as mensagens (todas funcionam sem
  internet). Todos os temas passam no contraste mínimo WCAG AA.
- A prévia aparece na hora em todas as janelas abertas; **Cancelar** desfaz e **OK** salva.
- Trocar a fonte ou a cena deixa o tema como **Personalizado**; **Restaurar tema** volta a fonte e a cena do tema.
- **Cena**: uma imagem no topo da lista de contatos e da conversa e, bem suave, atrás das mensagens. Há 10
  cenas prontas (Céu, Folhas, Pétalas, Aurora, Pôr do sol, Ondas, Brasas, Pontilhado, Noite estrelada e
  Montanhas; cada tema tem a sua), **Nenhuma** ou **Procurar...** para usar uma imagem do computador (recortada
  em 16:9 e reduzida automaticamente; dá para remover no ×). O texto sobre a cena fica claro ou escuro conforme
  a própria imagem, com uma faixa translúcida quando ela é muito contrastada.
- Cores de mensagem ilegíveis no fundo atual são ajustadas só na sua tela (no escuro, preto vira a cor de texto
  do tema). O contato continua recebendo a cor que você escolheu.

### Porta e conexão automática ao abrir

A porta padrão é **47800**, sempre a mesma, então o `IP:porta` de cada máquina não muda entre aberturas (o IP pode mudar se o roteador trocar o DHCP; reserve o IP no roteador para ficar fixo). Se a 47800 estiver ocupada, o app cai para uma porta livre e mostra qual na barra lateral.

Flags de linha de comando:

| Flag                      | Efeito                                                                 |
| ------------------------- | ---------------------------------------------------------------------- |
| `--port=5001`             | Usa essa porta (ignora a de Opções). Se estiver ocupada, o login mostra o erro |
| `--connect=IP[:porta]`    | Conecta assim que entrar. Pode repetir ou separar por vírgula          |

```bash
# dev (os dois "--" são necessários com o Forge)
npm start -- -- --connect=192.168.0.10:47800

# Mac, app instalado
open -a "Chat LAN" --args --connect=192.168.0.10:47800
```

No Windows, crie um atalho e acrescente no **Destino**: `"...\chat-lan.exe" --connect=192.168.0.10:47800`.

## Versões e atualização automática

Cada push na `main` dispara o workflow [Release](.github/workflows/release.yml): ele roda os testes,
gera o instalador do Windows e publica um release no GitHub. A versão é `MAJOR.MINOR` do
`package.json` mais o número da execução (ex.: `1.0.42`). Para subir `MAJOR` ou `MINOR`, altere o
`package.json`; o terceiro número o CI preenche.

O app instalado pelo `ChatLAN-Setup.exe` procura versão nova ao abrir e a cada 30 minutos (via
[update.electronjs.org](https://update.electronjs.org)). Ele baixa em segundo plano e mostra uma barra
fixa **"Nova versão disponível · Atualizar"**. Ao clicar, o app reinicia já na versão nova. Sem
internet, a checagem falha em silêncio.

Limites: só funciona no Windows instalado pelo Setup (o `.zip` não atualiza sozinho). No macOS a
atualização exige o app assinado com um certificado da Apple.

## Arquitetura

```
Renderer (HTML/CSS/TS) ──IPC──▶ Preload (window.chat) ──IPC──▶ Main (Node)
                                                                ├─ PeerManager: servidor WebSocket (porta dinâmica) + conexões
                                                                └─ Discovery: mDNS `_chatlan._tcp` (anúncio e busca)
```

| Arquivo                      | Papel                                                                   |
| ---------------------------- | ----------------------------------------------------------------------- |
| `src/shared/protocol.ts`     | Tipos e validação das mensagens, assinatura de imagens, regra do ID menor |
| `src/shared/api.ts`          | Tipos da API `window.chat` e nomes dos canais IPC                        |
| `src/main/peer-manager.ts`   | Servidor/cliente WebSocket, hello, mapa de peers, deduplicação, reconexão |
| `src/main/discovery.ts`      | `bonjour-service`: publica, busca e `unpublishAll` ao sair               |
| `src/main/config.ts`         | Flags `--port`/`--connect`, perfil e IPs salvos em `settings.json`       |
| `src/main.ts`                | Janela, IPC, ciclo de vida                                               |
| `src/preload.ts`             | `contextBridge` → `window.chat`                                          |
| `src/renderer.ts`            | Entrada da interface: barra de título, navegação e eventos da rede       |
| `src/renderer/*.ts`          | Telas: `login`, `home` (contatos), `chat`; menu de status, toasts, estado |

### Protocolo

Frames de texto são JSON; o conteúdo da imagem vai no frame binário logo após o cabeçalho `image`.

| Tipo    | Campos                              | Uso                                             |
| ------- | ----------------------------------- | ----------------------------------------------- |
| `hello` | `id`, `name`, `status`, `message` | Enviado pelos dois lados ao conectar (`status`/`message` opcionais) |
| `presence` | `from`, `name`, `status`, `message` | Mudança de status ou mensagem pessoal       |
| `nudge` | `from`, `ts`                        | "Chamar atenção": a janela de quem recebe treme |
| `wink`  | `from`, `wink`, `ts`                | Animação; `wink` precisa ser um dos ids conhecidos |
| `avatar` | `from`, `mime`, `size`             | Imagem de exibição (até 256 KB); o próximo frame binário é a imagem. `size` 0 = removeu. Enviada a cada contato ao conectar |
| `chat`  | `from`, `text`, `ts`, `font?`       | Mensagem de texto; `font` = `{family, size, bold, italic, underline, color}` |
| `image` | `from`, `name`, `mime`, `size`, `ts`| Cabeçalho; o próximo frame binário é a imagem   |

Regras: JSON inválido é descartado; nada é aceito antes do `hello`; `from` precisa ser o id do peer da conexão; binário sem cabeçalho pendente é descartado; a imagem é conferida por tamanho e assinatura (não só pelo mime), e SVG não é aceito.

### Conexões

- Via mDNS só o lado com **ID menor** disca.
- Na conexão manual qualquer lado pode discar; se surgirem duas conexões para o mesmo peer, os dois lados mantêm a iniciada pelo ID menor.
- Alvos conhecidos (mDNS e manuais) são rediscados a cada 3 s enquanto o peer estiver offline. Ping a cada 10 s derruba conexões mortas.

### Segurança

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; CSP restritiva (`img-src 'self' blob:`); mensagens renderizadas só com `textContent`; navegação e janelas novas bloqueadas; `maxPayload` do ws em 10 MB.

## Rede e firewall

A maioria dos problemas é de rede, não de código.

**Windows**
- A rede precisa estar como **Privada** (Configurações → Rede e Internet → Wi-Fi → propriedades da rede).
- No primeiro uso o Firewall do Windows pergunta se o app pode se comunicar: marque **Redes privadas** e permita.
- Se tiver negado sem querer: Painel de Controle → Firewall do Windows Defender → *Permitir um aplicativo* → marque *Chat LAN* em Privada.

**macOS**
- No primeiro uso o macOS pede acesso à **Rede Local**: permita. Para rever: Ajustes do Sistema → Privacidade e Segurança → Rede Local.
- Com o firewall do macOS ligado, permita conexões de entrada para o Chat LAN.
- O app não é assinado: na primeira abertura use botão direito → **Abrir** (Gatekeeper).

**Ainda não se encontram?**
- Confira se as máquinas se enxergam: `ping <ip-do-outro>`.
- Roteador que bloqueia multicast derruba o mDNS: use **Conectar por IP**.
- Rede de convidados/corporativa com isolamento de clientes impede qualquer comunicação: use outra rede ou o hotspot do Windows/Mac.
- Libere a porta TCP **47800** (ou a que aparece na barra lateral) e UDP 5353 (mDNS).

## Fora do MVP

Histórico persistente, arquivos genéricos/grandes em chunks, criptografia (wss://) e pareamento por código, comunicação entre redes, assinatura de código.
