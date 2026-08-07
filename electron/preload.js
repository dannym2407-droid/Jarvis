const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jarvisDesktop", {
  isElectron: true,
  onToggleListen: (fn) => {
    ipcRenderer.on("jarvis:toggle-listen", () => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
  },
  getInfo: () => ipcRenderer.invoke("jarvis:get-info")
});
