const { contextBridge } = require('electron');
const os = require('os');

contextBridge.exposeInMainWorld('chatTicketsDesktop', {
  platform: 'electron',
  version: '0.1.0',
  getHostname: () => {
    try {
      return os.hostname();
    } catch {
      return '';
    }
  },
});
