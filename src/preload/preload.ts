import { contextBridge, ipcRenderer } from 'electron';
import { CAPTURE_CHANNELS, CHANNELS } from '../shared/ipc';

const allowed = new Set<string>([...Object.values(CHANNELS), ...Object.values(CAPTURE_CHANNELS)]);

contextBridge.exposeInMainWorld('adags', {
  on(channel: string, cb: (data: unknown) => void) {
    if (!allowed.has(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  },
  send(channel: string, data?: unknown) {
    if (allowed.has(channel)) ipcRenderer.send(channel, data);
  },
});
