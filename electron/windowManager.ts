import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Tray,
} from 'electron';
import { warn } from 'electron-log';
import windowState from 'electron-window-state';
import { join } from 'path';
import { initAppIpcListener } from './appIpcListener';
import { appMenuTemplate } from './appMenu';
import { APP_ROOT, BASE_URL, IS_DEV } from './constants';
import { clearLndProxyCache, initLndProxy } from './lnd/lndProxyServer';
import { initTapdProxy } from './tapd/tapdProxyServer';

let tray: Tray | null = null;

class WindowManager {
  mainWindow: BrowserWindow | null = null;
  isDarkMode = nativeTheme.shouldUseDarkColors;

  start() {
    app.on('ready', async () => {
      await this.createMainWindow();
      initLndProxy(ipcMain);
      initTapdProxy(ipcMain);
      initAppIpcListener(ipcMain);
    });
    app.on('window-all-closed', this.onAllClosed);
    app.on('activate', this.onActivate);
  }

  async createMainWindow() {
    const menu = Menu.buildFromTemplate(appMenuTemplate());
    Menu.setApplicationMenu(menu);

    const mainState = windowState({
      defaultWidth: 900,
      defaultHeight: 600,
      file: 'window-state-main.json',
    });

    this.mainWindow = new BrowserWindow({
      x: mainState.x,
      y: mainState.y,
      width: mainState.width,
      height: mainState.height,
      minWidth: 900,
      icon: join(APP_ROOT, 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
      },
    });

    // create App system tray icon with context menus
    this.createAppTray();

    this.mainWindow.setMenuBarVisibility(false);

    if (IS_DEV) {
      await this.setupDevEnv();
    }

    this.mainWindow.on('closed', this.onMainClosed);

    // use dev server for hot reload or file in production
    this.mainWindow.loadURL(BASE_URL);

    // clear the proxy cached data if the window is reloaded
    this.mainWindow.webContents.on('did-finish-load', clearLndProxyCache);

    mainState.manage(this.mainWindow);
  }

  async setupDevEnv() {
    // install react & redux chrome dev tools
    const {
      default: install,
      REACT_DEVELOPER_TOOLS,
      REDUX_DEVTOOLS,
    } = require('electron-devtools-installer'); // eslint-disable-line @typescript-eslint/no-var-requires
    try {
      await install(REACT_DEVELOPER_TOOLS);
      await install(REDUX_DEVTOOLS);
    } catch (e) {
      warn('unable to install devtools', e);
    }
  }

  onMainClosed() {
    this.mainWindow = null;
  }

  onAllClosed() {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }

  onActivate() {
    if (this.mainWindow === null) {
      this.createMainWindow();
    }
  }

  /**
   * Creates App tray icon with a menu of options
   * to `Hide/Show` the app window
   * and also `quite` the running app instance
   * @returns void
   */
  createAppTray() {
    const TRAY_ICONS_ROOT = [APP_ROOT, 'assets', 'icons', 'tray'];

    /**
     * select `light` or `dark` icon based on host OS
     * system theme
     * @param path
     * @returns
     */
    const iconSelector = (path: 'quit' | 'minimize' | 'show') => {
      if (process.platform === 'darwin') {
        const imagePath = join(...TRAY_ICONS_ROOT, path, '16x16Template.png');
        const nativeImageFromPath = nativeImage.createFromPath(imagePath);
        nativeImageFromImagePath.setTemplateImage(true);
        return nativeImageFromPath;
      }

      if (nativeTheme.shouldUseDarkColors) {
        const imagePath = join(...TRAY_ICONS_ROOT, path, 'icon-dark.png');
        const nativeImageFromPath = nativeImage.createFromPath(imagePath);
        // nativeImageFromImagePath.setTemplateImage(true);
        return nativeImageFromPath;
      }

      if (!this.isDarkMode) {
        const imagePath = join(...TRAY_ICONS_ROOT, path, 'icon-light.png');
        const nativeImageFromPath = nativeImage.createFromPath(imagePath);
        // nativeImageFromImagePath.setTemplateImage(true);
        return nativeImageFromPath;
      }
    };

    const trayIcon =
      process.platform === 'darwin'
        ? join(...TRAY_ICONS_ROOT, '16x16Template.png')
        : join(...TRAY_ICONS_ROOT, '1024x1024-white.png');

    const nativeImageFromImagePath = nativeImage.createFromPath(trayIcon);

    nativeImageFromImagePath.setTemplateImage(true);

    tray = new Tray(nativeImageFromImagePath);
    tray.setIgnoreDoubleClickEvents(true);

    /**
     * `hides` polar windows
     */
    const handleOnHideClick = () => {
      if (process.platform !== 'darwin') {
        app.dock?.hide();
      }
      this.mainWindow?.setSkipTaskbar(true);
      this.mainWindow?.hide();
    };

    /**
     * `shows` polar window
     */
    const handleOnShowClick = () => {
      if (process.platform !== 'darwin') {
        app.dock?.show();
      }
      this.mainWindow?.setSkipTaskbar(false);
      this.mainWindow?.show();
    };

    /**
     * closes all windows and quits the app
     */
    const handleQuitClick = () => {
      app.quit();
    };

    const contextMenu: Menu = Menu.buildFromTemplate([
      {
        id: 'miniOpt',
        label: 'Minimize Window',
        click: handleOnHideClick,
        icon: iconSelector('minimize'),
      },
      {
        label: 'Show Window',
        click: handleOnShowClick,
        icon: iconSelector('show'),
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit Polar',
        icon: iconSelector('quit'),
        click: handleQuitClick,
      },
    ]);

    tray.setToolTip('Polar');
    tray.setContextMenu(contextMenu);
  }
}

export default WindowManager;
