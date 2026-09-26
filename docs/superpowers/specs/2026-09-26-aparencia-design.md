# Aparência: modo claro/escuro, temas e cenas

Data: 2026-09-26

Entrega em três fases, cada uma publicável sozinha (v1.0.6, v1.0.7, v1.0.8).

## Decisões

| Tema | Decisão |
|---|---|
| Modo | Sistema / Claro / Escuro. "Sistema" segue o SO na hora. |
| Temas | 8 pacotes (cor + cena + fonte sugerida), cada um com versão clara e escura: Azul clássico (padrão, idêntico ao visual atual), Verde, Rosa, Roxo, Laranja, Menta, Vermelho, Grafite. |
| Misturar | Tema é o ponto de partida: trocar só a cena ou só a fonte deixa o tema "Personalizado", com "Restaurar tema". |
| Cena | Topo (cabeçalho da lista e da conversa, degradê para o fundo) **e** atrás das mensagens (com véu da cor do fundo). |
| Galeria | ~10 cenas SVG embutidas + "Procurar…" (recorte 16:9, 1600×900 JPEG ≤ 400 KB). |
| Compartilhar | Como no WLM: o contato vê a sua cena na conversa com você; você vê a dele. Cores sempre do seu tema. "Mostrar cenas dos contatos" (padrão ligado). |
| Onde configurar | Janela "Aparência" no menu ☰ da lista de contatos, com prévia ao vivo; Cancelar desfaz, OK confirma. |

## Fase 1 — tokens, modo e temas

### Tokens

- Todas as cores do `src/index.css` viram variáveis semânticas (fundo, superfícies, texto, bordas, destaque,
  vidro da barra de título, cabeçalhos, linhas, campos, botões, foco, aviso, não lida). Status (disponível,
  ausente, ocupado, offline) continuam fixos.
- Os valores padrão (Azul clássico claro) ficam em `:root` e reproduzem exatamente o visual atual.
- Cores de ilustração (winks, emoticons, ícones SVG) podem ficar literais se marcadas com `/* cor-fixa */`.
- Teste automatizado: nenhuma cor literal fora do bloco de tokens, salvo `/* cor-fixa */`.

### Temas

- `src/shared/themes.ts`: definição dos 8 temas (id, nome, cor base, cena padrão, fonte sugerida) e
  `themeTokens(themeId, mode)` → mapa de tokens.
- Azul clássico claro = valores atuais; Azul clássico escuro = conjunto escuro desenhado à mão (vidro escuro
  próprio, não inversão). Os demais temas giram o matiz (e ajustam a saturação) dos tokens cromáticos do Azul
  clássico; neutros ficam. Grafite dessatura.
- Fontes sugeridas (todas favoritas, funcionam offline): Azul clássico Segoe UI, Verde Nunito, Rosa Raleway,
  Roxo Rubik, Laranja Manrope, Menta DM Sans, Vermelho Oswald, Grafite Inter.
- Teste: contraste WCAG AA (texto ≥ 4,5:1, bordas/ícones de controle ≥ 3:1) para cada tema × modo.

### Aplicação

- `settings.json` ganha `appearance: { mode, theme, fontCustomized }`.
- Renderer: `data-mode="light|dark"` no `<html>` + tokens do tema aplicados com `style.setProperty`;
  "Sistema" escuta `matchMedia('(prefers-color-scheme: dark)')`.
- Main: `nativeTheme.themeSource` e `backgroundColor` das janelas conforme o modo (sem flash branco);
  mudança vai para todas as janelas.
- Cor de fonte das mensagens: ajustada se ilegível no fundo atual (escura demais no escuro, clara demais no
  claro).

### Janela Aparência (fase 1)

- Modo (controle segmentado com ícones) e grade de temas (cartão com amostra de cor, nome e fonte).
- Prévia ao vivo em todas as janelas; Cancelar restaura; OK salva.
- Escolher tema aplica a fonte sugerida (a do usuário é substituída); se a fonte for trocada depois em
  "Alterar fonte", o tema aparece como "Personalizado" com "Restaurar tema".

## Fase 2 — cenas

- Cena no topo (≈150–180 px, degradê) da lista e da conversa, e atrás das mensagens com véu (≈88% claro,
  ≈82% escuro). Texto sobre a cena: sombra + faixa translúcida se a imagem for "agitada"; cor do texto do
  topo pelo brilho médio medido da imagem.
- Galeria: ~10 SVG embutidos (céu, aurora, ondas, bolhas, pontilhado, montanhas, pôr do sol, noite estrelada,
  papel, grade retrô) + "Nenhuma". Cada tema aponta uma como padrão.
- "Procurar…": recorte 16:9 no centro, 1600×900 JPEG ≤ 400 KB, guardado em `userData/scenes/`; removível.
- Trocar cena deixa o tema "Personalizado".
- Sem animações com "reduzir movimento".

## Fase 3 — cena compartilhada

- Mensagem `scene`: `{ kind: 'builtin', id }` | `{ kind: 'image', mime, size }` + bytes (≤ 400 KB, PNG/JPEG
  validado pela assinatura) | `{ kind: 'none' }`. Enviada ao conectar e ao mudar. Versões antigas ignoram.
- Conversa mostra a cena do contato (topo e fundo); sem cena dele → a sua. Véu mais forte sobre cena de
  contato. Cores sempre do seu tema. Opção "Mostrar cenas dos contatos".
- Exibição só por `blob:`; id de galeria desconhecido é ignorado.

## Testes

Tokens sem cor literal, contraste por tema × modo, geração de paletas, aplicar/personalizar/restaurar tema,
recorte de cena, protocolo `scene` (validação, limite, compatibilidade). Manual com duas instâncias e
capturas em todas as telas, modos e temas.

## Fora do escopo

Cor personalizada livre, editor de temas, cenas animadas, temas por conversa.
