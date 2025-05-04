import { useState, useEffect } from 'react';

function FilePanel({ 
  files, 
  currentFolderId, 
  isLoading, 
  onFolderClick,
  onBackClick,
  onVideoClick,
  onSubtitleClick,
  onSearch,
  userName,
  accessToken,
  driveId
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('fileManage'); // 'recentPlay' or 'fileManage'
  const [recentPlays, setRecentPlays] = useState([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'root', name: '根目录' }]);

  // 加载最近播放列表
  useEffect(() => {
    if (activeTab === 'recentPlay') {
      loadRecentPlays();
    }
  }, [activeTab]);

  const loadRecentPlays = async () => {
    setIsLoadingRecent(true);
    try {
      // 使用本地存储的播放历史，而不是API
      const result = await window.electronAPI.getPlayHistory();
      
      if (result && result.success && result.items) {
        // 按最近播放时间排序
        const sortedHistory = result.items.sort((a, b) => {
          return b.last_played_at - a.last_played_at;
        });
        setRecentPlays(sortedHistory);
      } else {
        console.error('Failed to load recent plays:', result);
        setRecentPlays([]);
      }
    } catch (error) {
      console.error('Error loading recent plays:', error);
      setRecentPlays([]);
    } finally {
      setIsLoadingRecent(false);
    }
  };

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      // 搜索时重置面包屑为根目录
      setBreadcrumbs([{ id: 'root', name: '根目录' }]);
      onSearch(searchQuery);
    }
  };

  // 处理导航到文件夹
  const handleFolderClick = (folderId, folderName) => {
    // 添加新的面包屑
    setBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }]);
    onFolderClick(folderId);
  };

  // 处理返回上级操作（兼容原有的返回按钮功能）
  const handleBackClick = () => {
    if (breadcrumbs.length > 1) {
      // 移除当前面包屑并导航到上一级
      const newBreadcrumbs = breadcrumbs.slice(0, -1);
      setBreadcrumbs(newBreadcrumbs);
      
      // 导航到上一级目录
      const parentFolder = newBreadcrumbs[newBreadcrumbs.length - 1];
      onFolderClick(parentFolder.id);
    } else {
      // 如果只有根目录，使用原有的返回函数
      onBackClick();
    }
  };

  // 处理面包屑导航
  const handleBreadcrumbClick = (index) => {
    // 获取目标文件夹ID
    const targetFolder = breadcrumbs[index];
    
    // 更新面包屑（保留到点击的位置）
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    
    // 导航到目标文件夹
    onFolderClick(targetFolder.id);
  };

  // 切换标签时，如果是文件管理标签，确保有根目录面包屑
  useEffect(() => {
    if (activeTab === 'fileManage' && breadcrumbs.length === 0) {
      setBreadcrumbs([{ id: 'root', name: '根目录' }]);
    }
  }, [activeTab, breadcrumbs.length]);

  // 当currentFolderId变化时，如果不是通过面包屑导航的，更新面包屑
  useEffect(() => {
    // 检查当前面包屑的最后一项是否与当前文件夹ID匹配
    const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
    
    if (lastBreadcrumb?.id !== currentFolderId && currentFolderId === 'root') {
      // 如果是回到根目录但不是通过面包屑点击，重置面包屑
      setBreadcrumbs([{ id: 'root', name: '根目录' }]);
    }
  }, [currentFolderId, breadcrumbs]);

  // 面包屑导航组件
  const BreadcrumbNavigation = () => (
    <div className="flex items-center flex-wrap mb-2 text-sm no-drag overflow-x-auto whitespace-nowrap">
      {breadcrumbs.map((crumb, index) => (
        <div key={crumb.id} className="flex items-center">
          {index > 0 && <span className="mx-1 text-gray-400">/</span>}
          <span 
            className={`cursor-pointer ${index === breadcrumbs.length - 1 
              ? 'text-blue-600 font-medium' 
              : 'text-blue-500 hover:text-blue-700'}`}
            onClick={() => handleBreadcrumbClick(index)}
            title={crumb.name}
          >
            {crumb.name}
          </span>
        </div>
      ))}
    </div>
  );

  const renderFileList = () => {
    if (isLoading) {
      return <div className="flex justify-center mt-4"><span className="loading loading-spinner loading-md"></span></div>;
    }

    return (
      <div className="w-full no-drag">
        <BreadcrumbNavigation />
        
        <ul className="menu menu-sm w-full bg-base-100 p-0 rounded">
          {files.map(item => {
            if (item.type === 'folder') {
              return (
                <li key={item.file_id} className="text-sm">
                  <a 
                    className="py-1 flex items-center hover:bg-blue-50"
                    onClick={() => handleFolderClick(item.file_id, item.name)}
                  >
                    <svg className="w-4 h-4 text-blue-500 mr-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 4H2v16h20V6H12l-2-2z"/>
                    </svg>
                    <span className="flex-1 truncate">{item.name}</span>
                  </a>
                </li>
              );
            } else if (item.category === 'video' || (item.mime_type && item.mime_type.startsWith('video'))) {
              return (
                <li key={item.file_id} className="text-sm">
                  <a 
                    className="py-1 flex items-center hover:bg-green-50"
                    onClick={() => onVideoClick(item.file_id, item.name)}
                  >
                    <svg className="w-4 h-4 text-green-500 mr-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.video_media_metadata && item.video_media_metadata.duration && (
                      <span className="text-xs text-gray-400 ml-1">
                        {formatDuration(item.video_media_metadata.duration)}
                      </span>
                    )}
                  </a>
                </li>
              );
            } else if (item.name.toLowerCase().endsWith('.ass') || item.name.toLowerCase().endsWith('.srt')) {
              const subtitleType = item.name.toLowerCase().endsWith('.srt') ? 'SRT' : 'ASS';
              return (
                <li key={item.file_id} className="text-sm">
                  <a 
                    className="py-1 flex items-center hover:bg-yellow-50"
                    onClick={() => onSubtitleClick(item.file_id, item.name)}
                  >
                    <svg className="w-4 h-4 text-yellow-500 mr-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 5v14h-18v-14h18m0-2h-18c-1.1 0-2 0.9-2 2v14c0 1.1 0.9 2 2 2h18c1.1 0 2-0.9 2-2v-14c0-1.1-0.9-2-2-2z"></path>
                      <path d="M7 15h-2v-2h2v2z"></path>
                      <path d="M15 15h-6v-2h6v2z"></path>
                      <path d="M7 11h-2v-2h2v2z"></path>
                      <path d="M15 11h-6v-2h6v2z"></path>
                    </svg>
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-yellow-600 ml-1">
                      字幕 {subtitleType}
                    </span>
                  </a>
                </li>
              );
            } else {
              return (
                <li key={item.file_id} className="text-sm">
                  <a className="py-1 flex items-center">
                    <svg className="w-4 h-4 text-gray-400 mr-1" fill="currentColor" viewBox="0 0 24 24">
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

  const renderRecentPlaysList = () => {
    if (isLoadingRecent) {
      return <div className="flex justify-center mt-4"><span className="loading loading-spinner loading-md"></span></div>;
    }

    if (!recentPlays.length) {
      return <div className="text-center text-gray-500 mt-4">暂无最近播放记录</div>;
    }

    return (
      <ul className="menu menu-sm w-full bg-base-100 p-0 rounded no-drag">
        {recentPlays.map(item => (
          <li key={item.file_id} className="text-sm">
            <a 
              className="py-1 flex items-center hover:bg-green-50"
              onClick={() => onVideoClick(item.file_id, item.name)}
            >
              <svg className="w-4 h-4 text-green-500 mr-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <span className="flex-1 truncate">{item.name}</span>
              {/* 播放进度 */}
              <div className="flex flex-col items-end ml-1">
                {item.duration && item.play_cursor && (
                  <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden mt-1">
                    <div 
                      className="h-full bg-blue-500" 
                      style={{ 
                        width: `${Math.min(100, (parseFloat(item.play_cursor) / parseFloat(item.duration)) * 100)}%` 
                      }}
                    ></div>
                  </div>
                )}
                <div className="flex text-xs">
                  {item.play_cursor && (
                    <span className="text-blue-500">
                      {formatDuration(item.play_cursor)}
                    </span>
                  )}
                  {item.duration && (
                    <span className="text-gray-400 ml-1">
                      / {formatDuration(item.duration)}
                    </span>
                  )}
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    );
  };

  const formatDuration = (seconds) => {
    seconds = Math.floor(Number(seconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${(h > 0 && m < 10) ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // 清空历史记录按钮
  const ClearHistoryButton = () => (
    <button
      className="text-xs text-red-500 hover:text-red-700 no-drag"
      onClick={async () => {
        if (window.confirm('确定要清空播放历史记录吗？')) {
          try {
            await window.electronAPI.clearPlayHistory();
            loadRecentPlays(); // 重新加载（将显示空列表）
          } catch (error) {
            console.error('Failed to clear history:', error);
          }
        }
      }}
    >
      清空记录
    </button>
  );

  return (
    <div className="w-1/4 min-w-[260px] max-w-[320px] bg-white rounded-lg shadow-sm p-3 flex flex-col">
      <h1 className="text-lg font-bold text-center mb-2 flex justify-center items-center">
        <img src="/src/assets/logo.png" className="w-6 h-6 mr-2" alt="Kumarajiva Logo" />
        Kumarajiva
      </h1>
      
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Tabs */}
        <div className="flex mb-2 border-b no-drag">
          <button
            className={`flex-1 py-2 text-sm font-medium ${activeTab === 'recentPlay' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('recentPlay')}
          >
            最近播放
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium ${activeTab === 'fileManage' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('fileManage')}
          >
            文件管理
          </button>
        </div>
        
        {/* Search Box - only show in file management mode */}
        {activeTab === 'fileManage' && (
          <div className="mb-2 no-drag">
            <input 
              type="text" 
              placeholder="搜索" 
              className="input input-sm input-bordered w-full rounded-md"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
            />
          </div>
        )}
        
        {/* Tab header actions */}
        {activeTab === 'recentPlay' && recentPlays.length > 0 && (
          <div className="flex justify-end mb-2">
            <ClearHistoryButton />
          </div>
        )}
        
        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'fileManage' ? renderFileList() : renderRecentPlaysList()}
        </div>
      </div>
    </div>
  );
}

export default FilePanel; 