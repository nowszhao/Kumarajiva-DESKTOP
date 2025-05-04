import { useState, useEffect } from 'react';
import FilePanel from './components/FilePanel';
import PlayerPanel from './components/PlayerPanel';
import TitleBar from './components/TitleBar';
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
  const [currentSubtitle, setCurrentSubtitle] = useState(null);
  const [subtitleContent, setSubtitleContent] = useState(null);
  const [authState, setAuthState] = useState('initial'); // initial, loading, qrcode, success, error
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [usingStoredToken, setUsingStoredToken] = useState(false); // 标记是否使用本地存储的令牌
  const [tokenStatus, setTokenStatus] = useState(''); // 令牌状态消息
  
  // 启动时检查本地令牌
  useEffect(() => {
    checkStoredToken();
  }, []);
  
  // 检查Electron存储的令牌
  const checkStoredToken = async () => {
    try {
      const tokenData = await electronAPI.getStoredToken();
      
      // 如果没有令牌，需要登录
      if (tokenData.error) {
        console.log('没有可用的令牌，需要登录');
        return;
      }
      
      // 有效令牌
      console.log(`找到有效的令牌，有效期还剩约${tokenData.remaining_hours}小时`);
      setTokenStatus(`使用已保存的登录令牌（有效期还剩约${tokenData.remaining_hours}小时）`);
      setAuthState('loading');
      setUsingStoredToken(true);
      
      // 尝试使用存储的令牌获取用户信息
      setAccessToken(tokenData.access_token);
      const success = await getDriveInfo(tokenData.access_token);
      
      if (!success) {
        // 令牌无效，清除并提示重新登录
        console.log('令牌无效，需要重新登录');
        setTokenStatus('令牌已失效，请重新登录');
        await electronAPI.clearToken();
        setAuthState('initial');
        setUsingStoredToken(false);
      }
    } catch (e) {
      console.error('检查令牌时出错:', e);
      setTokenStatus('检查令牌时出错，请重新登录');
      setAuthState('initial');
      setUsingStoredToken(false);
    }
  };
  
  // 处理令牌过期或无效的情况
  const handleTokenExpired = () => {
    console.log('令牌已过期或无效，准备重新登录');
    logout();
    setTokenStatus('登录已过期，请重新登录');
    startLogin();
  };
  
  // 检查API响应中是否有令牌过期错误
  const checkResponseForTokenError = (result) => {
    // 检查阿里云盘API常见的令牌错误
    if (
      result.error && 
      (
        (result.code && 
         (result.code === 'AccessTokenExpired' || 
          result.code === 'AccessTokenInvalid' || 
          result.code === 'UserNotLogin')
        ) ||
        (result.message && 
         (result.message.includes('token') || 
          result.message.includes('登录') || 
          result.message.includes('授权'))
        )
      )
    ) {
      return true;
    }
    return false;
  };
  
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
      
      // 令牌已由Electron端自动保存，这里只设置状态
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
        if (checkResponseForTokenError(result)) {
          handleTokenExpired();
          return false;
        }
        throw new Error(result.message);
      }
      
      const driveIdValue = result.resource_drive_id || result.default_drive_id;
      setDriveId(driveIdValue);
      setUserName(result.nick_name || result.user_name);
      setAuthState('success');
      setIsLoggedIn(true);
      
      // Load root folder after login
      loadFileList(token || accessToken, driveIdValue, 'root');
      return true;
    } catch (e) {
      setAuthState('error');
      console.error('Get drive info failed', e);
      return false;
    }
  };

  const loadFileList = async (token = accessToken, driveIdValue = driveId, folderId = currentFolderId) => {
    setIsLoading(true);
    try {
      const result = await electronAPI.loadFileList(token || accessToken, driveIdValue || driveId, folderId);
      
      console.log('##########loadFileList result', result);

      if (result.error) {
        throw new Error(result.message);
      }

      if(result.code === 'AccessTokenExpired') {
        handleTokenExpired();
        return;
      }
      
      setFiles(result.items || []);
      setCurrentFolderId(folderId);
      setIsLoading(false);
      
      // 返回当前文件夹的信息，用于更新面包屑
      return {
        id: folderId,
        items: result.items || []
      };
    } catch (e) {
      setIsLoading(false);
      console.error('File list loading failed', e);
      return null;
    }
  };

  const navigateToFolder = (folderId) => {
    // 不再需要手动管理导航历史，由面包屑组件负责
    // setFolderStack([...folderStack, currentFolderId]);
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
        // 获取播放进度
        const playCursor = result.play_cursor || '0';
        
        // 创建视频对象
        const videoInfo = {
          url,
          name: fileName,
          fileId,
          file_id: fileId, // 用于历史记录
          drive_id: driveId,
          duration: '0', // 初始化，会在播放时更新
          play_cursor: playCursor
        };
        
        setCurrentVideo(videoInfo);
        
        // 保存播放历史
        await electronAPI.savePlayHistory({
          file_id: fileId,
          name: fileName,
          drive_id: driveId,
          play_cursor: playCursor,
          duration: '0' // 初始化，会在播放时更新
        });
        
        // 清除之前的字幕
        clearSubtitle();
        
        // 在当前目录自动查找匹配的字幕文件
        autoFindSubtitle(fileName);
      } else {
        console.error('No playable URL found');
      }
    } catch (e) {
      console.error('Failed to get video URL', e);
    }
  };

  // 更新播放进度
  const updatePlayProgress = async (fileId, currentTime, duration) => {
    if (!fileId || currentTime === undefined) return;
    
    try {
      // 转换为字符串格式，保持与API返回格式一致
      const playCursor = String(currentTime.toFixed(3));
      const durationStr = String(duration.toFixed(3));
      
      // 更新本地播放进度
      await electronAPI.updatePlayProgress(fileId, playCursor);
      
      // 如果有总时长，也一并更新
      if (duration) {
        await electronAPI.savePlayHistory({
          file_id: fileId,
          duration: durationStr,
          play_cursor: playCursor
        });
      }
      
      console.log(`播放进度已更新: ${playCursor}/${durationStr}`);
    } catch (e) {
      console.error('Failed to update play progress', e);
    }
  };

  // 自动查找匹配的字幕文件
  const autoFindSubtitle = async (videoFileName) => {
    // 如果没有视频文件名，无法匹配
    if (!videoFileName) return;
    
    try {
      console.log('自动查找字幕文件，视频名称:', videoFileName);
      
      // 获取视频文件名（不含扩展名）
      const videoNameWithoutExt = videoFileName.replace(/\.[^/.]+$/, "");
      
      // 查找当前目录中所有以视频文件名开头的字幕文件（.ass或.srt）
      const matchingSubtitle = files.find(item => 
        (item.name.toLowerCase().endsWith('.ass') || item.name.toLowerCase().endsWith('.srt')) && 
        item.name.startsWith(videoNameWithoutExt)
      );
      
      if (matchingSubtitle) {
        console.log('找到匹配字幕:', matchingSubtitle.name);
        loadSubtitle(matchingSubtitle.file_id, matchingSubtitle.name);
      }
    } catch (e) {
      console.error('自动查找字幕失败:', e);
    }
  };

  // 加载字幕文件
  const loadSubtitle = async (fileId, fileName) => {
    try {
      setIsLoading(true);
      console.log(`开始加载字幕: ${fileName}, 文件ID: ${fileId}`);
      
      const result = await electronAPI.getSubtitleContent(accessToken, driveId, fileId);
      
      if (result.error) {
        console.error('字幕加载错误:', result.message);
        throw new Error(result.message);
      }
      
      if (!result.content || typeof result.content !== 'string') {
        console.error('字幕内容无效:', result);
        throw new Error('无效的字幕内容');
      }
      
      if (result.content.trim().length === 0) {
        console.error('字幕内容为空');
        throw new Error('字幕文件内容为空');
      }
      
      // 检查字幕文件格式是否有效
      if (!result.content.includes('[Script Info]') && !result.content.includes('WEBVTT')) {
        console.warn('字幕内容格式可能无效，缺少有效的ASS或SRT格式标记');
      }
      
      console.log(`成功加载字幕文件，内容长度: ${result.content.length}, 编码: ${result.encoding || 'utf-8'}`);
      
      setCurrentSubtitle({
        fileId,
        name: fileName,
        encoding: result.encoding || 'utf-8'
      });
      
      setSubtitleContent(result.content);
      setIsLoading(false);
    } catch (e) {
      setIsLoading(false);
      console.error('Failed to load subtitle file', e);
      
      // 显示错误提示
      if (window.confirm(`字幕加载失败: ${e.message || '未知错误'}\n点击确定重试，取消放弃`)) {
        // 用户选择重试
        loadSubtitle(fileId, fileName);
      }
    }
  };

  // 清除字幕
  const clearSubtitle = () => {
    setCurrentSubtitle(null);
    setSubtitleContent(null);
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

  // 登出函数
  const logout = async () => {
    // 清除Electron中存储的令牌
    await electronAPI.clearToken();
    
    // 重置状态
    setIsLoggedIn(false);
    setAccessToken(null);
    setDriveId(null);
    setUserName('');
    setCurrentVideo(null);
    setCurrentSubtitle(null);
    setSubtitleContent(null);
    setAuthState('initial');
    
    console.log('已登出，清除令牌');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <TitleBar userName={userName} isLoggedIn={isLoggedIn} onLogout={logout} />
      
      {/* 登录状态下显示主界面 */}
      {isLoggedIn ? (
        <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 overflow-hidden">
          <FilePanel 
            files={files}
            currentFolderId={currentFolderId}
            isLoading={isLoading}
            onFolderClick={navigateToFolder}
            onBackClick={navigateBack}
            onVideoClick={playVideo}
            onSubtitleClick={loadSubtitle}
            onSearch={searchFiles}
            userName={userName}
            accessToken={accessToken}
            driveId={driveId}
          />
          <PlayerPanel 
            currentVideo={currentVideo}
            currentSubtitle={currentSubtitle}
            subtitleContent={subtitleContent}
            onUpdatePlayProgress={updatePlayProgress}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          {authState === 'initial' && (
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">欢迎使用 Kumarajiva 桌面版</h2>
              <p className="mb-6 text-gray-600">请登录阿里云盘账号以访问您的视频文件</p>
              
              {/* 显示令牌状态信息 */}
              {tokenStatus && (
                <div className="mb-4 p-2 bg-blue-50 text-blue-700 rounded text-sm">
                  {tokenStatus}
                </div>
              )}
              
              <button 
                className="btn btn-primary"
                onClick={startLogin}
              >
                开始登录
              </button>
            </div>
          )}
          
          {authState === 'loading' && (
            <div className="text-center">
              <div className="mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              </div>
              <p className="text-gray-600">
                {usingStoredToken ? '正在使用保存的登录令牌...' : '正在处理登录请求...'}
              </p>
            </div>
          )}
          
          {authState === 'qrcode' && (
            <div className="text-center">
              <div className="mb-4">
                <img src={qrCodeUrl} alt="二维码" className="w-64 h-64 mx-auto border p-2" />
              </div>
              <p className="text-orange-500 font-medium">请使用阿里云盘 APP 扫描二维码登录</p>
            </div>
          )}
          
          {authState === 'error' && (
            <div className="text-center">
              <div className="mb-4 text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 font-medium">登录失败，请重试</p>
              <button 
                className="btn btn-primary mt-4"
                onClick={startLogin}
              >
                重新登录
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App; 