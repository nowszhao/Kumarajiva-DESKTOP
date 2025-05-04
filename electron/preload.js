const { contextBridge, ipcRenderer } = require('electron');

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type]);
  }
});

// 暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 通用 API 请求接口
  apiRequest: (method, url, data, headers) => 
    ipcRenderer.invoke('api-request', { method, url, data, headers }),
  
  // 阿里云盘 API 接口
  getQrcode: () => ipcRenderer.invoke('get-qrcode'),
  
  checkQrcodeStatus: (sid) => 
    ipcRenderer.invoke('check-qrcode-status', { sid }),
  
  getAccessToken: (authCode) => 
    ipcRenderer.invoke('get-access-token', { authCode }),
  
  getDriveInfo: (accessToken) => 
    ipcRenderer.invoke('get-drive-info', { accessToken }),
  
  loadFileList: (accessToken, driveId, folderId) => 
    ipcRenderer.invoke('load-file-list', { accessToken, driveId, folderId }),
  
  searchFiles: (accessToken, driveId, query) => 
    ipcRenderer.invoke('search-files', { accessToken, driveId, query }),
  
  getVideoUrl: (accessToken, driveId, fileId) => 
    ipcRenderer.invoke('get-video-url', { accessToken, driveId, fileId }),
  
  // 获取最近播放列表
  getRecentPlayList: (accessToken) => 
    ipcRenderer.invoke('get-recent-play-list', { accessToken }),
  
  // 本地播放历史管理
  getPlayHistory: () => ipcRenderer.invoke('get-play-history'),
  savePlayHistory: (videoInfo) => ipcRenderer.invoke('save-play-history', videoInfo),
  updatePlayProgress: (fileId, playCursor) => 
    ipcRenderer.invoke('update-play-progress', { fileId, playCursor }),
  clearPlayHistory: () => ipcRenderer.invoke('clear-play-history'),
  
  // 字幕文件获取
  getSubtitleContent: (accessToken, driveId, fileId) => 
    ipcRenderer.invoke('get-subtitle-content', { accessToken, driveId, fileId }),
  
  // 视频代理
  proxyVideoStream: (url) => ipcRenderer.invoke('proxy-video-stream', url),
  
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-control', 'minimize'),
  maximizeWindow: () => ipcRenderer.send('window-control', 'maximize'),
  closeWindow: () => ipcRenderer.send('window-control', 'close'),
  
  // 令牌管理
  getStoredToken: () => ipcRenderer.invoke('get-stored-token'),
  clearToken: () => ipcRenderer.invoke('clear-token'),
  
  // 渲染器优化 - 帮助处理可能的内存和GPU问题
  optimizeRenderer: () => ipcRenderer.invoke('optimize-renderer'),
}); 