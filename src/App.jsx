import { useState, useEffect } from 'react';
import FilePanel from './components/FilePanel';
import PlayerPanel from './components/PlayerPanel';
import './index.css';

// 声明全局 electronAPI 类型，用于 TypeScript 支持
const electronAPI = window.electronAPI;

function App() {
  // State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [driveId, setDriveId] = useState(null);
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [folderStack, setFolderStack] = useState([]);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [currentVideo, setCurrentVideo] = useState(null);
  const [authState, setAuthState] = useState('initial'); // initial, loading, qrcode, success, error
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  
  // Methods
  const startLogin = async () => {
    setAuthState('loading');
    try {
      const result = await electronAPI.getQrcode();
      
      if (result.error) {
        throw new Error(result.message);
      }
      
      setQrCodeUrl(result.qrCodeUrl);
      setAuthState('qrcode');
      pollQRCodeStatus(result.sid);
    } catch (e) {
      setAuthState('error');
      console.error('QR code generation failed', e);
    }
  };

  const pollQRCodeStatus = (sid) => {
    const timer = setInterval(async () => {
      try {
        const result = await electronAPI.checkQrcodeStatus(sid);
        
        if (result.error) {
          throw new Error(result.message);
        }
        
        if (result.status === 'LoginSuccess') {
          clearInterval(timer);
          getAccessToken(result.authCode);
        }
      } catch (e) {
        console.error('QR poll error', e);
      }
    }, 1500);
  };

  const getAccessToken = async (authCode) => {
    setAuthState('loading');
    try {
      const result = await electronAPI.getAccessToken(authCode);
      
      if (result.error) {
        throw new Error(result.message);
      }
      
      setAccessToken(result.access_token);
      getDriveInfo(result.access_token);
    } catch (e) {
      setAuthState('error');
      console.error('Token exchange failed', e);
    }
  };

  const getDriveInfo = async (token) => {
    try {
      const result = await electronAPI.getDriveInfo(token || accessToken);
      
      if (result.error) {
        throw new Error(result.message);
      }
      
      const driveIdValue = result.resource_drive_id || result.default_drive_id;
      setDriveId(driveIdValue);
      setUserName(result.nick_name || result.user_name);
      setAuthState('success');
      setIsLoggedIn(true);
      
      // Load root folder after login
      loadFileList(token || accessToken, driveIdValue, 'root');
    } catch (e) {
      setAuthState('error');
      console.error('Get drive info failed', e);
    }
  };

  const loadFileList = async (token = accessToken, driveIdValue = driveId, folderId = currentFolderId) => {
    setIsLoading(true);
    try {
      const result = await electronAPI.loadFileList(token || accessToken, driveIdValue || driveId, folderId);
      
      if (result.error) {
        throw new Error(result.message);
      }
      
      setFiles(result.items || []);
      setCurrentFolderId(folderId);
      setIsLoading(false);
    } catch (e) {
      setIsLoading(false);
      console.error('File list loading failed', e);
    }
  };

  const navigateToFolder = (folderId) => {
    setFolderStack([...folderStack, currentFolderId]);
    loadFileList(accessToken, driveId, folderId);
  };

  const navigateBack = () => {
    if (folderStack.length > 0) {
      const prevFolder = folderStack[folderStack.length - 1];
      setFolderStack(folderStack.slice(0, -1));
      loadFileList(accessToken, driveId, prevFolder);
    }
  };

  const playVideo = async (fileId, fileName) => {
    try {
      const result = await electronAPI.getVideoUrl(accessToken, driveId, fileId);
      
      if (result.error) {
        throw new Error(result.message);
      }
      
      // Get best quality or fallback
      const list = result.video_preview_play_info.live_transcoding_task_list || [];
      const sd = list.find(x => x.template_id === 'SD' && x.url);
      const ld = list.find(x => x.template_id === 'LD' && x.url);
      const url = (sd && sd.url) || (ld && ld.url) || '';
      
      if (url) {
        setCurrentVideo({
          url,
          name: fileName,
          fileId
        });
      } else {
        console.error('No playable URL found');
      }
    } catch (e) {
      console.error('Failed to get video URL', e);
    }
  };

  const searchFiles = async (query) => {
    if (!query) return;
    setIsLoading(true);
    
    try {
      const result = await electronAPI.searchFiles(accessToken, driveId, query);
      
      if (result.error) {
        throw new Error(result.message);
      }
      
      setFiles(result.items || []);
      setIsLoading(false);
    } catch (e) {
      setIsLoading(false);
      console.error('Search failed', e);
    }
  };

  return (
    <div className="container mx-auto flex flex-row gap-8 p-4 h-screen">
      <FilePanel 
        isLoggedIn={isLoggedIn}
        authState={authState}
        qrCodeUrl={qrCodeUrl}
        startLogin={startLogin}
        userName={userName}
        files={files}
        isLoading={isLoading}
        currentFolderId={currentFolderId}
        navigateToFolder={navigateToFolder}
        navigateBack={navigateBack}
        playVideo={playVideo}
        searchFiles={searchFiles}
      />
      
      <PlayerPanel 
        currentVideo={currentVideo}
      />
    </div>
  );
}

export default App; 