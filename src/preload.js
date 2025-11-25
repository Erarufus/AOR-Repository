const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
    navTo: (page) => ipcRenderer.send('nav-To', page),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (filePath, content) => ipcRenderer.send('file:save', filePath, content),
  });