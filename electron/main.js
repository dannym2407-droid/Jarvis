const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, shell, ipcMain } = require("electron");
const path = require("node:path");
const http = require("node:http");

process.env.JARVIS_ELECTRON = "1";

let mainWindow = null;
let tray = null;
let serverInfo = null;
let quitting = false;

const ROOT = path.join(__dirname, "..");

function waitForHealth(url, tries = 40) {
  return new Promise((resolve, reject) => {
    let left = tries;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(800, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      left -= 1;
      if (left <= 0) reject(new Error("Jarvis no respondió a tiempo"));
      else setTimeout(tick, 250);
    };
    tick();
  });
}

async function ensureServer() {
  // Si ya hay un server (npm start), lo reutiliza
  try {
    await waitForHealth("http://127.0.0.1:8787/api/health", 3);
    serverInfo = { url: "http://127.0.0.1:8787/", reused: true };
    return serverInfo;
  } catch {
    // arranca embebido
  }

  const { startServer } = require(path.join(ROOT, "server.js"));
  serverInfo = await startServer({ openBrowser: false });
  await waitForHealth(`${serverInfo.url}api/health`);
  return serverInfo;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    title: "JARVIS",
    backgroundColor: "#03080f",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  const url = (serverInfo && serverInfo.url) || "http://127.0.0.1:8787/";
  mainWindow.loadURL(url);
}

function trayIcon() {
  // Icono simple generado (16x16 teal)
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - 7.5;
      const dy = y - 7.5;
      const inside = dx * dx + dy * dy <= 36;
      buf[i] = inside ? 45 : 0;
      buf[i + 1] = inside ? 212 : 0;
      buf[i + 2] = inside ? 191 : 0;
      buf[i + 3] = inside ? 255 : 0;
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("JARVIS");
  const menu = Menu.buildFromTemplate([
    {
      label: "Mostrar Jarvis",
      click: () => {
        if (!mainWindow) createWindow();
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: "Escuchar (Ctrl+Shift+J)",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send("jarvis:toggle-listen");
        }
      }
    },
    {
      label: "Siempre visible",
      type: "checkbox",
      checked: false,
      click: (item) => {
        if (mainWindow) mainWindow.setAlwaysOnTop(Boolean(item.checked));
      }
    },
    { type: "separator" },
    {
      label: "Abrir panel web (opcional)",
      click: () => shell.openExternal("http://127.0.0.1:8787/")
    },
    { type: "separator" },
    {
      label: "Salir",
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", () => {
    if (!mainWindow) createWindow();
    mainWindow.show();
    mainWindow.focus();
  });
}

function registerShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+J", () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("jarvis:toggle-listen");
  });
  globalShortcut.register("CommandOrControl+Shift+H", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  try {
    await ensureServer();
    createWindow();
    createTray();
    registerShortcuts();
  } catch (error) {
    console.error("[electron]", error);
    app.quit();
  }
});

app.on("window-all-closed", (e) => {
  // Mantener vivo en bandeja (Windows)
  e.preventDefault();
});

app.on("before-quit", () => {
  quitting = true;
  globalShortcut.unregisterAll();
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
  } else {
    createWindow();
  }
});

ipcMain.handle("jarvis:get-info", () => ({
  isElectron: true,
  url: serverInfo?.url || "http://127.0.0.1:8787/"
}));
