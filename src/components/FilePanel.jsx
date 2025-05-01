import { useState } from 'react';

function FilePanel({ 
  isLoggedIn, 
  authState, 
  qrCodeUrl, 
  startLogin, 
  userName, 
  files, 
  isLoading, 
  currentFolderId, 
  navigateToFolder, 
  navigateBack, 
  playVideo,
  searchFiles
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      searchFiles(searchQuery);
    }
  };

  const renderAuthSection = () => {
    switch(authState) {
      case 'initial':
        return (
          <button 
            className="btn btn-primary btn-lg" 
            onClick={startLogin}
          >
            登录阿里云盘
          </button>
        );
      case 'loading':
        return <span className="loading loading-spinner loading-lg"></span>;
      case 'qrcode':
        return (
          <div className="flex flex-col items-center">
            <img 
              src={qrCodeUrl} 
              alt="二维码" 
              className="w-64 h-64 rounded-lg border-2 border-gray-200" 
            />
            <div className="text-center text-orange-500 mt-3">请使用阿里云盘 APP 扫码</div>
          </div>
        );
      case 'success':
        return <div className="text-success text-center">登录成功，欢迎 {userName}</div>;
      case 'error':
        return (
          <div className="flex flex-col items-center">
            <div className="text-error mb-4">登录失败，请重试</div>
            <button 
              className="btn btn-primary" 
              onClick={startLogin}
            >
              重新登录
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  const renderFileList = () => {
    if (isLoading) {
      return <div className="flex justify-center mt-8"><span className="loading loading-spinner loading-lg"></span></div>;
    }

    return (
      <div className="w-full">
        {currentFolderId !== 'root' && (
          <div 
            className="flex items-center cursor-pointer mb-4 text-blue-500 hover:text-blue-700"
            onClick={navigateBack}
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            返回上级
          </div>
        )}
        
        <ul className="menu w-full bg-base-100 rounded-box">
          {files.map(item => {
            if (item.type === 'folder') {
              return (
                <li key={item.file_id}>
                  <a 
                    className="flex items-center hover:bg-blue-50"
                    onClick={() => navigateToFolder(item.file_id)}
                  >
                    <svg className="w-5 h-5 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 4H2v16h20V6H12l-2-2z"/>
                    </svg>
                    <span className="flex-1 truncate">{item.name}</span>
                  </a>
                </li>
              );
            } else if (item.category === 'video' || (item.mime_type && item.mime_type.startsWith('video'))) {
              return (
                <li key={item.file_id}>
                  <a 
                    className="flex items-center hover:bg-green-50"
                    onClick={() => playVideo(item.file_id, item.name)}
                  >
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.video_media_metadata && item.video_media_metadata.duration && (
                      <span className="text-xs text-gray-400 ml-2">
                        {formatDuration(item.video_media_metadata.duration)}
                      </span>
                    )}
                  </a>
                </li>
              );
            } else {
              return (
                <li key={item.file_id}>
                  <a className="flex items-center">
                    <svg className="w-5 h-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M4 4h16v16H4z"/>
                    </svg>
                    <span className="flex-1 truncate">{item.name}</span>
                  </a>
                </li>
              );
            }
          })}
        </ul>
      </div>
    );
  };

  const formatDuration = (seconds) => {
    seconds = Math.floor(Number(seconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${(h > 0 && m < 10) ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-1/3 min-w-[320px] max-w-[400px] bg-white rounded-2xl shadow-md p-6 flex flex-col">
      <h1 className="text-2xl font-bold text-center mb-6">Kumarajiva</h1>
      
      {!isLoggedIn ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          {renderAuthSection()}
        </div>
      ) : (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Search Box - Only visible after login */}
          <div className="mb-4">
            <input 
              type="text" 
              placeholder="搜索" 
              className="input input-bordered w-full rounded-xl" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
            />
          </div>
          
          {/* File List - Only visible after login */}
          <div className="flex-1 overflow-y-auto pr-1">
            {renderFileList()}
          </div>
        </div>
      )}
    </div>
  );
}

export default FilePanel; 