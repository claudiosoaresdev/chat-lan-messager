// Tokens de cor da interface. Os valores de CLASSIC_LIGHT são o visual original (Azul clássico, modo claro)
// e ficam espelhados no :root do index.css para o primeiro desenho da janela.
// Tons intermediários (cinzas de texto, bordas claras, fundos de barra) não são tokens: o CSS deriva
// com color-mix(in srgb, var(--token) N%, var(--bg)), então acompanham o tema sozinhos.
export const TOKEN_NAMES = [
  // superfícies e texto
  'bg',
  'surface',
  'field-bg',
  'text',
  'text-strong',
  'muted',
  'link',
  'accent',
  'accent-soft',
  'accent-text',
  'selection',
  // efeitos (brilho, sombra, véu)
  'sheen',
  'shadow',
  'overlay',
  'glow',
  'window-glow',
  // bordas
  'border-strong',
  'panel-line',
  'field-border',
  'box-border',
  'select-border',
  // linhas de lista e menus
  'row-hover',
  'row-hover-border',
  'row-focus',
  'row-selected',
  'menu-hover',
  'menu-hover-border',
  // botões
  'btn-face',
  'btn-border',
  'btn-focus',
  // barra de título
  'title-glass',
  'title-text',
  'title-line',
  'titlebtn-bg',
  'titlebtn-bg-hover',
  'titlebtn-icon',
  // cabeçalhos
  'header-bg',
  'header-line',
  'login-bg',
  'accent-green',
  // avisos
  'warning-bg',
  'warning-bg-hover',
  'warning-border',
  'error-bg',
  'error-border',
  // não lida / chamar atenção
  'unread',
  'unread-soft',
  'unread-strong',
  'unread-text',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
export type Tokens = Record<TokenName, string>;

export const CLASSIC_LIGHT: Tokens = {
  bg: '#fff',
  surface: '#fff',
  'field-bg': '#fff',
  text: '#1a2b45',
  'text-strong': '#1e1e1e',
  muted: '#6b7a90',
  link: '#0b4fa5',
  accent: '#0b3f92',
  'accent-soft': '#a9c6e8',
  'accent-text': '#fff',
  selection: '#3399ff',

  sheen: '#fff',
  shadow: '#000',
  overlay: 'rgba(11, 30, 60, 0.25)',
  glow: '#5cc1e8',
  'window-glow': 'linear-gradient(180deg, var(--glow) 0%, #ffffff 34%)',

  'border-strong': '#6f95c2',
  'panel-line': '#d5e1ee',
  'field-border': '#9db6d9',
  'box-border': '#abbdd3',
  'select-border': '#7da2ce',

  'row-hover': 'linear-gradient(180deg, #fafbfd, #ebf3fd)',
  'row-hover-border': '#b8d6fb',
  'row-focus': 'linear-gradient(180deg, #dcebfc, #c1dbfc)',
  'row-selected': '#cfe2fa',
  'menu-hover': 'linear-gradient(180deg, #eaf6fd, #d9f0fc)',
  'menu-hover-border': '#a8d8f8',

  'btn-face': 'linear-gradient(180deg, #fafafa, #ececec 55%, #e2e2e2)',
  'btn-border': '#aca899',
  'btn-focus': '#3c7fb1',

  // Barra de título "vidro" azul-claro (Windows 7 / Live Messenger).
  'title-glass': 'linear-gradient(180deg, #eaf4fd 0%, #d3e7fa 46%, #bad8f6 50%, #c9e2f9 78%, #d9ebfb 100%)',
  'title-text': '#1e3a5f',
  'title-line': '#93b8df',
  'titlebtn-bg': 'linear-gradient(180deg, #f4f9fe 0%, #dcebfa 48%, #c3dbf4 52%, #d6e8fa 100%)',
  'titlebtn-bg-hover': 'linear-gradient(180deg, #fbfdff 0%, #e6f2fd 48%, #cfe5fb 52%, #e5f2fe 100%)',
  'titlebtn-icon': '#2a4a72',

  'header-bg':
    'radial-gradient(60% 90% at 100% 0%, rgba(111, 190, 68, 0.22), rgba(111, 190, 68, 0) 70%), ' +
    'radial-gradient(80% 120% at 0% 0%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0) 60%), ' +
    'linear-gradient(180deg, #a8dbf1 0%, #d4effa 55%, #eef9fd 100%)',
  'header-line': '#b9d7ea',
  'login-bg':
    'radial-gradient(90% 55% at 18% 0%, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0) 60%), ' +
    'radial-gradient(70% 40% at 85% 8%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 70%), ' +
    'linear-gradient(180deg, #9fd8f1 0%, #cdeef9 20%, #eef9fd 38%, #ffffff 55%)',
  'accent-green': '#6fbe44',

  'warning-bg': 'linear-gradient(180deg, #fffbe0, #fff3b8)',
  'warning-bg-hover': 'linear-gradient(180deg, #fffdf0, #fff6c8)',
  'warning-border': '#e0c65a',
  'error-bg': 'linear-gradient(180deg, #fff1f0, #fde0de)',
  'error-border': '#e3a19c',

  unread: '#e8a13a',
  'unread-soft': '#fff4e0',
  'unread-strong': '#ffc76b',
  'unread-text': '#7a5a00',
};

/** Cores de status (disponível, ausente, ocupado, offline): iguais em todos os temas. */
export const STATUS_COLORS = {
  'st-available': '#4cb122',
  'st-away': '#f2b50d',
  'st-busy': '#d8342b',
  'st-offline': '#9aa0a6',
} as const;
