const { app, BrowserWindow, ipcMain, net, protocol, session } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = process.env.ELECTRON_IS_DEV !== '0';

let mainWindow;

// 阿里云盘 API 配置
const CLIENT_ID = '717cbc119af349399f525555efb434e1';
const CLIENT_SECRET = '0743bd65f7384d5c878f564de7d7276a';
const API_BASE = 'https://openapi.alipan.com';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // 关键设置：禁用同源策略和允许不安全内容（仅用于桌面应用）
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f6fbfa'
  });

  // Load the appropriate URL based on environment
  if (isDev) {
    // In development mode
    console.log('Running in development mode');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production mode
    console.log('Running in production mode');
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('Loading from path:', indexPath);
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      console.error('Production build not found:', indexPath);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// API 代理函数
function makeRequest(method, url, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });

    request.on('response', (response) => {
      let responseData = '';
      
      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });
      
      response.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({
            status: response.statusCode,
            data: parsedData
          });
        } catch (error) {
          reject({
            status: response.statusCode,
            error: 'Failed to parse response data',
            raw: responseData
          });
        }
      });
    });

    request.on('error', (error) => {
      reject({
        error: error.message
      });
    });

    if (data) {
      const postData = typeof data === 'string' 
        ? data 
        : JSON.stringify(data);
      request.write(postData);
    }

    request.end();
  });
}

// 设置 IPC 处理程序，用于 API 请求
ipcMain.handle('api-request', async (event, { method, url, data, headers }) => {
  try {
    const response = await makeRequest(method, url, data, headers);
    return response;
  } catch (error) {
    console.error('API request error:', error);
    return { error: true, message: error.message || 'Unknown error' };
  }
});

// 阿里云盘 API 接口
ipcMain.handle('get-qrcode', async () => {
  try {
    const response = await makeRequest('POST', `${API_BASE}/oauth/authorize/qrcode`, {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scopes: [
        'user:base',
        'file:all:read',
        'file:all:write',
        'album:shared:read',
        'file:share:write'
      ],
      width: 300,
      height: 300
    });
    return response.data;
  } catch (error) {
    console.error('QR Code generation error:', error);
    return { error: true, message: 'Failed to generate QR code' };
  }
});

ipcMain.handle('check-qrcode-status', async (event, { sid }) => {
  try {
    const response = await makeRequest('GET', `${API_BASE}/oauth/qrcode/${sid}/status`);
    return response.data;
  } catch (error) {
    console.error('QR Code status check error:', error);
    return { error: true, message: 'Failed to check QR code status' };
  }
});

ipcMain.handle('get-access-token', async (event, { authCode }) => {
  try {
    const response = await makeRequest('POST', `${API_BASE}/oauth/access_token`, {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: authCode
    });
    return response.data;
  } catch (error) {
    console.error('Access token error:', error);
    return { error: true, message: 'Failed to get access token' };
  }
});

ipcMain.handle('get-drive-info', async (event, { accessToken }) => {
  try {
    const response = await makeRequest('POST', `${API_BASE}/adrive/v1.0/user/getDriveInfo`, 
      {}, 
      { 'Authorization': `Bearer ${accessToken}` }
    );
    return response.data;
  } catch (error) {
    console.error('Drive info error:', error);
    return { error: true, message: 'Failed to get drive info' };
  }
});

ipcMain.handle('load-file-list', async (event, { accessToken, driveId, folderId }) => {
  try {
    const response = await makeRequest('POST', `${API_BASE}/adrive/v1.0/openFile/list`, 
      {
        drive_id: driveId,
        parent_file_id: folderId
      }, 
      { 'Authorization': `Bearer ${accessToken}` }
    );
    return response.data;
  } catch (error) {
    console.error('File list error:', error);
    return { error: true, message: 'Failed to load file list' };
  }
});

ipcMain.handle('search-files', async (event, { accessToken, driveId, query }) => {
  try {
    const response = await makeRequest('POST', `${API_BASE}/adrive/v1.0/openFile/search`, 
      {
        limit: 50,
        query: `name match \"${query}\"`,
        drive_id: driveId
      }, 
      { 'Authorization': `Bearer ${accessToken}` }
    );
    return response.data;
  } catch (error) {
    console.error('Search error:', error);
    return { error: true, message: 'Failed to search files' };
  }
});

ipcMain.handle('get-video-url', async (event, { accessToken, driveId, fileId }) => {
  try {
    const response = await makeRequest('POST', `${API_BASE}/adrive/v1.0/openFile/getVideoPreviewPlayInfo`, 
      {
        drive_id: driveId,
        file_id: fileId,
        category: 'live_transcoding'
      }, 
      { 'Authorization': `Bearer ${accessToken}` }
    );
    return response.data;
  } catch (error) {
    console.error('Video URL error:', error);
    return { error: true, message: 'Failed to get video URL' };
  }
});

// 添加视频流代理功能
ipcMain.handle('proxy-video-stream', async (event, url) => {
  // 直接返回原始URL，使用内置网络模块绕过CORS
  return { proxyUrl: url };
});

app.whenReady().then(() => {
  // 拦截所有网络请求来解决CORS问题
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    // 确保所有请求都有Referer和Origin头
    details.requestHeaders['Referer'] = 'https://www.aliyundrive.com/';
    details.requestHeaders['Origin'] = 'https://www.aliyundrive.com';
    callback({ requestHeaders: details.requestHeaders });
  });

  // 拦截响应头，修改CORS相关的头信息
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const { responseHeaders } = details;
    
    // 添加允许的CORS头
    if (!responseHeaders['Access-Control-Allow-Origin']) {
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    }
    
    callback({ responseHeaders });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
}); 