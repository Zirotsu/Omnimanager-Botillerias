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
    backup: label => ipcRenderer.invoke('omni:database:backup', label),
    snapshot: () => ipcRenderer.invoke('omni:data:snapshot'),
    replaceSnapshot: snapshot => ipcRenderer.invoke('omni:data:replace-snapshot', snapshot),
    list: collection => ipcRenderer.invoke('omni:data:list', collection),
    put: (collection, id, data) => ipcRenderer.invoke('omni:data:put', collection, id, data),
    remove: (collection, id) => ipcRenderer.invoke('omni:data:remove', collection, id),
    saveProfile: profile => ipcRenderer.invoke('omni:data:save-profile', profile),
    importProducts: products => ipcRenderer.invoke('omni:data:import-products', products),
    importBarcodes: mappings => ipcRenderer.invoke('omni:data:import-barcodes', mappings),
    adjustStock: payload => ipcRenderer.invoke('omni:data:adjust-stock', payload),
    commitSale: payload => ipcRenderer.invoke('omni:data:commit-sale', payload),
    voidSale: saleId => ipcRenderer.invoke('omni:data:void-sale', saleId),
    commitPurchase: payload => ipcRenderer.invoke('omni:data:commit-purchase', payload),
    voidPurchase: purchaseId => ipcRenderer.invoke('omni:data:void-purchase', purchaseId),
    openCash: payload => ipcRenderer.invoke('omni:data:open-cash', payload),
    closeCash: payload => ipcRenderer.invoke('omni:data:close-cash', payload)
  },
  print: {
    html: payload => ipcRenderer.invoke('omni:print:html', payload)
  },
  app: {
    getInfo: () => ipcRenderer.invoke('omni:app:info')
  }
});
