const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
    navTo: (page) => ipcRenderer.send('nav-To', page)
  
  });