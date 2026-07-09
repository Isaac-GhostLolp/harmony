import { contextBridge, ipcRenderer } from 'electron'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api = {
  library: {
    selectAndScan: () => invoke('library:selectAndScan'),
    importPaths: (paths: string[]) => invoke('library:importPaths', paths),
    getSongs: () => invoke('library:getSongs'),
    refresh: () => invoke('library:refresh'),
    deleteSong: (songId: number, fromDisk: boolean) =>
      invoke('library:deleteSong', songId, fromDisk),
    search: (q: string) => invoke('library:search', q),
    onScanProgress: (
      cb: (p: { processed: number; total: number; current: string }) => void
    ): (() => void) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        p: { processed: number; total: number; current: string }
      ): void => cb(p)
      ipcRenderer.on('scan:progress', listener)
      return () => {
        ipcRenderer.removeListener('scan:progress', listener)
      }
    }
  },
  albums: {
    getAll: () => invoke('albums:getAll'),
    getSongs: (id: number) => invoke('albums:getSongs', id),
    setPreferredCover: (albumId: number, preferred: 'auto' | 'embedded' | 'online') =>
      invoke('albums:setPreferredCover', albumId, preferred)
  },
  artists: {
    getAll: () => invoke('artists:getAll'),
    getSongs: (id: number) => invoke('artists:getSongs', id)
  },
  playlists: {
    getAll: () => invoke('playlists:getAll'),
    create: (name: string) => invoke('playlists:create', name),
    rename: (id: number, name: string) => invoke('playlists:rename', id, name),
    remove: (id: number) => invoke('playlists:delete', id),
    duplicate: (id: number) => invoke('playlists:duplicate', id),
    getSongs: (id: number) => invoke('playlists:getSongs', id),
    addSong: (playlistId: number, songId: number) =>
      invoke('playlists:addSong', playlistId, songId),
    removeSong: (playlistId: number, songId: number) =>
      invoke('playlists:removeSong', playlistId, songId),
    reorder: (playlistId: number, songIds: number[]) =>
      invoke('playlists:reorder', playlistId, songIds)
  },
  favorites: {
    toggle: (songId: number) => invoke('favorites:toggle', songId),
    getAll: () => invoke('favorites:getAll')
  },
  history: {
    add: (songId: number) => invoke('history:add', songId),
    getRecent: () => invoke('history:getRecent')
  },
  stats: {
    get: () => invoke('stats:get')
  },
  lyrics: {
    resolve: (songId: number, force = false) => invoke('lyrics:resolve', songId, force)
  },
  online: {
    fetchCover: (songId: number, force = false) => invoke('online:fetchCover', songId, force)
  },
  player: {
    toggleMini: () => ipcRenderer.send('mini:toggle'),
    sendState: (state: unknown) => ipcRenderer.send('player:state', state),
    onState: (cb: (state: unknown) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, state: unknown): void => cb(state)
      ipcRenderer.on('player:state', listener)
      return () => {
        ipcRenderer.removeListener('player:state', listener)
      }
    },
    sendCommand: (cmd: 'toggle' | 'next' | 'prev') => ipcRenderer.send('player:command', cmd),
    onCommand: (cb: (cmd: string) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, cmd: string): void => cb(cmd)
      ipcRenderer.on('player:command', listener)
      return () => {
        ipcRenderer.removeListener('player:command', listener)
      }
    },
    configureDiscord: (enabled: boolean, clientId: string) =>
      ipcRenderer.send('discord:configure', enabled, clientId)
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (key: string, value: unknown) => invoke('settings:set', key, value)
  },
  updater: {
    get: () => invoke('updater:get'),
    check: () => invoke('updater:check'),
    install: () => invoke('updater:install'),
    onStatus: (cb: (status: unknown) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, status: unknown): void => cb(status)
      ipcRenderer.on('updater:status', listener)
      return () => {
        ipcRenderer.removeListener('updater:status', listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('harmony', api)

export type HarmonyApi = typeof api
