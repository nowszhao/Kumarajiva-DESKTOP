import { useState } from 'react';

function FilePanel({ 
  files, 
  currentFolderId, 
  isLoading, 
  onFolderClick,
  onBackClick,
  onVideoClick,
  onSubtitleClick,
  onSearch,
  userName
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      onSearch(searchQuery);
    }
  };

  // 返回按钮组件
  const BackButton = () => (
    <div 
      className="flex items-center cursor-pointer mb-2 text-blue-500 hover:text-blue-700 text-sm no-drag"
      onClick={onBackClick}
    >
      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
      </svg>
      返回上级
    </div>
  );

  const renderFileList = () => {
    if (isLoading) {
      return <div className="flex justify-center mt-4"><span className="loading loading-spinner loading-md"></span></div>;
    }

    return (
      <div className="w-full no-drag">
        {currentFolderId !== 'root' && <BackButton />}
        
        <ul className="menu menu-sm w-full bg-base-100 p-0 rounded">
          {files.map(item => {
            if (item.type === 'folder') {
              return (
                <li key={item.file_id} className="text-sm">
                  <a 
                    className="py-1 flex items-center hover:bg-blue-50"
                    onClick={() => onFolderClick(item.file_id)}
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

  const formatDuration = (seconds) => {
    seconds = Math.floor(Number(seconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${(h > 0 && m < 10) ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-1/4 min-w-[260px] max-w-[320px] bg-white rounded-lg shadow-sm p-3 flex flex-col">
      <h1 className="text-lg font-bold text-center mb-2 flex justify-center items-center">
        <img src="/src/assets/logo.svg" className="w-6 h-6 mr-2" alt="Kumarajiva Logo" />
        Kumarajiva
      </h1>
      
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Search Box */}
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
        
        {/* File List */}
        <div className="flex-1 overflow-y-auto">
          {renderFileList()}
        </div>
      </div>
    </div>
  );
}

export default FilePanel; 