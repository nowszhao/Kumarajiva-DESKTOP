import React from 'react';

function TitleBar({ userName, isLoggedIn, onLogout }) {
  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.minimizeWindow();
    }
  };

  const handleMaximize = () => {
    if (window.electronAPI) {
      window.electronAPI.maximizeWindow();
    }
  };

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.closeWindow();
    }
  };

  return (
    <div className="app-title-bar bg-gray-100 border-b border-gray-200 select-none flex items-center py-1 px-3 drag">
      <div className="flex-1 flex">
        <div className="flex items-center ml-2">
          <img src="/src/assets/logo.png" className="w-5 h-5 mr-2" alt="Kumarajiva Logo" />
          <span className="text-sm font-medium">Kumarajiva</span>
        </div>
        
        {/* 用户信息 */}
        {isLoggedIn && userName && (
          <div className="flex items-center ml-4 text-xs text-gray-600">
            <span>欢迎，{userName}</span>
            <button 
              onClick={onLogout}
              className="ml-2 px-2 py-0.5 bg-gray-200 hover:bg-gray-300 rounded text-xs no-drag"
              title="退出登录"
            >
              退出
            </button>
          </div>
        )}
      </div>
      
      <div className="flex items-center no-drag space-x-1">
        <button 
          className="p-1 hover:bg-gray-200 rounded-md focus:outline-none"
          onClick={handleMinimize}
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 12H6" />
          </svg>
        </button>
        
        <button 
          className="p-1 hover:bg-gray-200 rounded-md focus:outline-none"
          onClick={handleMaximize}
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          </svg>
        </button>
        
        <button 
          className="p-1 hover:bg-red-100 hover:text-red-600 rounded-md focus:outline-none"
          onClick={handleClose}
        >
          <svg className="w-4 h-4 text-gray-600 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar; 