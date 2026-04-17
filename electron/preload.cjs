/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("CabinetDesktop", {
  runtime: "electron",
  multicaWsUrl: process.env.CABINET_MULTICA_WS_PROXY_URL || process.env.MULTICA_WS_URL || null,
  multicaFetch: (request) => ipcRenderer.invoke("multica:fetch", request),
});
