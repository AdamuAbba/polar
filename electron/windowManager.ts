import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron';
import { warn } from 'electron-log';
import windowState from 'electron-window-state';
import { join } from 'path';
import { initAppIpcListener } from './appIpcListener';
import { appMenuTemplate } from './appMenu';
import { APP_ROOT, BASE_URL, IS_DEV } from './constants';
import { clearLndProxyCache, initLndProxy } from './lnd/lndProxyServer';
import { initTapdProxy } from './tapd/tapdProxyServer';

class WindowManager {
  mainWindow: BrowserWindow | null = null;
  tray: Tray | null = null;

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
    if (!this.tray) {
      this.createAppTray();
    }

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
    const trayIcon =
      process.platform === 'darwin'
        ? join(APP_ROOT, 'assets', 'icons', '16x16.png')
        : join(APP_ROOT, 'assets', 'icon.png');

    const nativeImageFromImagePath = nativeImage.createFromPath(trayIcon);

    nativeImageFromImagePath.setTemplateImage(true);

    this.tray = new Tray(nativeImageFromImagePath);
    this.tray.setIgnoreDoubleClickEvents(true);

    const quitIcon =
      process.platform === 'darwin'
        ? join(...TRAY_ICONS_ROOT, 'quit', '16x16.png')
        : join(...TRAY_ICONS_ROOT, 'quit', '96x96.png');

    const MinimizeIcon =
      process.platform === 'darwin'
        ? join(...TRAY_ICONS_ROOT, 'minimize', '16x16.png')
        : join(...TRAY_ICONS_ROOT, 'minimize', '96x96.png');

    const showIcon =
      process.platform === 'darwin'
        ? join(...TRAY_ICONS_ROOT, 'show', '16x16.png')
        : join(...TRAY_ICONS_ROOT, 'show', '96x96.png');

    const nativeQuitImageFromPath = nativeImage.createFromPath(quitIcon);
    const nativeMinimizeImageFromPath = nativeImage.createFromPath(MinimizeIcon);
    const nativeShowImageFromPath = nativeImage.createFromPath(showIcon);

    // mark images as template for OS light and dark mode
    nativeQuitImageFromPath.setTemplateImage(true);
    nativeMinimizeImageFromPath.setTemplateImage(true);
    nativeShowImageFromPath.setTemplateImage(true);

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
        label: 'Minimize to Tray',
        click: handleOnHideClick,
        icon: nativeMinimizeImageFromPath,
      },
      {
        label: 'Show Window',
        click: handleOnShowClick,
        icon: nativeShowImageFromPath,
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit Polar',
        icon: nativeQuitImageFromPath,
        click: handleQuitClick,
      },
    ]);
    this.tray.setToolTip('Polar');
    this.tray.setContextMenu(contextMenu);
  }
}

export default WindowManager;
