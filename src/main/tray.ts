// Ícone na bandeja (área de notificação no Windows, barra de menus no mac), como no MSN.
import { Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';

export interface TrayActions {
  open(): void;
  quit(): void;
}

export function createTray(iconDir: string, actions: TrayActions): Tray {
  const mac = process.platform === 'darwin';
  // createFromPath carrega sozinho a versão @2x ao lado do arquivo.
  const image = nativeImage.createFromPath(path.join(iconDir, mac ? 'trayTemplate.png' : 'tray.png'));
  if (mac) image.setTemplateImage(true);
  const tray = new Tray(image);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Chat Live Messenger', click: actions.open },
      { type: 'separator' },
      { label: 'Sair', click: actions.quit },
    ]),
  );
  // No Windows o clique abre a lista de contatos; no mac o clique abre o menu (padrão do sistema).
  if (!mac) tray.on('click', actions.open);
  return tray;
}
