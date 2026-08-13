// PLAN 16.4: minimal preload — the only bridge this app has today, scoped to
// exactly one call. contextIsolation is Electron's default since v12, so the
// renderer (served over http://127.0.0.1:PORT, not file://) has no other way
// to reach a native dialog. Phase 17.3 will add a second exposed call
// (update checks) to this same object rather than a second preload.
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("cscms", {
  // Returns the chosen absolute path, or null if the operator cancelled.
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
})
