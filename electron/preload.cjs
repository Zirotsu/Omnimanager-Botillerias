const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omniStandalone', {
  license: {
    getStatus: () => ipcRenderer.invoke('omni:license:status'),
    startDemo: () => ipcRenderer.invoke('omni:license:start-demo'),
    activate: token => ipcRenderer.invoke('omni:license:activate', token),
    getInstallationId: () => ipcRenderer.invoke('omni:license:installation-id')
  },
  database: {
    getInfo: () => ipcRenderer.invoke('omni:database:info'),
    backup: label => ipcRenderer.invoke('omni:database:backup', label)
  },
  app: {
    getInfo: () => ipcRenderer.invoke('omni:app:info')
  }
});
