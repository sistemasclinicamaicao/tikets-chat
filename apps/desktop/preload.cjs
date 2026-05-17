const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('chatTicketsDesktop', {
  platform: 'electron',
  version: '0.1.0',
});
