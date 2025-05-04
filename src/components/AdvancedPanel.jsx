import { useState, useEffect, useRef, useCallback } from 'react';
import SubtitleList from './SubtitleList';
import llmService from '../utils/LlmService';


function AdvancedPanel({ subtitleContent, currentTime, onSubtitleClick }) {
  const [activeTab, setActiveTab] = useState('subtitleList'); // 'subtitleList' or 'analysis'
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [contentHash, setContentHash] = useState(null); // 用于跟踪字幕内容变化
  const [lastAnalysisHash, setLastAnalysisHash] = useState(null); // 记录最后一次分析的内容hash
  const [usingCachedResult, setUsingCachedResult] = useState(false); // 标记是否使用缓存结果
  
  // 计算字幕内容哈希值，用于检测变化
  useEffect(() => {
    if (subtitleContent) {
      // 简单哈希函数 - 使用字幕内容长度和前100个字符
      const simpleHash = `${subtitleContent.length}_${subtitleContent.substring(0, 100).replace(/\s/g, '')}`;
      setContentHash(simpleHash);
      
      // 如果内容变化了，重置分析结果和缓存状态
      if (lastAnalysisHash && simpleHash !== lastAnalysisHash) {
        setAnalysisResult(null);
        setError(null);
        setUsingCachedResult(false);
      }
    } else {
      setContentHash(null);
    }
  }, [subtitleContent, lastAnalysisHash]);
  
  // 切换标签页
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // 只有在没有分析结果、当前不在分析过程中、有字幕内容、内容变更时才自动触发分析
    if (tab === 'analysis' && !analysisResult && !isAnalyzing && subtitleContent && 
        (!lastAnalysisHash || contentHash !== lastAnalysisHash)) {
      analyzeSubtitle();
    }
  };
  
  // 检查缓存中是否已存在分析结果
  const checkCachedAnalysis = useCallback(() => {
    if (!contentHash) return null;

    try {
      // 从localStorage获取缓存的分析结果
      const cachedResults = localStorage.getItem(`subtitle_analysis_${contentHash}`);
      if (cachedResults) {
        console.log("使用缓存的字幕分析结果");
        // 标记使用了缓存
        setUsingCachedResult(true);
        return JSON.parse(cachedResults);
      }
    } catch (e) {
      console.error("读取缓存分析结果失败:", e);
    }
    return null;
  }, [contentHash]);

  // 保存分析结果到缓存
  const saveAnalysisToCache = useCallback((result) => {
    if (!contentHash || !result) return;
    
    try {
      localStorage.setItem(`subtitle_analysis_${contentHash}`, JSON.stringify(result));
      console.log("分析结果已缓存");
    } catch (e) {
      console.error("缓存分析结果失败:", e);
    }
  }, [contentHash]);
  
  // 组件加载时检查缓存
  useEffect(() => {
    if (contentHash && !analysisResult && !isAnalyzing) {
      const cached = checkCachedAnalysis();
      if (cached) {
        setAnalysisResult(cached);
        setLastAnalysisHash(contentHash);
      }
    }
  }, [contentHash, analysisResult, isAnalyzing, checkCachedAnalysis]);
  
  // 获取当前字幕文本
  const getCurrentSubtitleText = () => {
    if (!subtitleContent) return null;
    
    try {
      // 分割字幕行
      const lines = subtitleContent.split('\n');
      const englishLines = [];
      
      // 逐行处理字幕
      for (const line of lines) {
        // 过滤掉时间戳、标记行和纯数字行
        if (line.trim() && 
            !line.includes('[') && 
            !line.includes('-->') && 
            !/^\d+$/.test(line.trim()) && 
            !line.match(/^\d{2}:\d{2}:\d{2}/) &&
            !line.match(/{.*}/) &&  // 过滤掉标记语法，如 {\\an8}
            !line.match(/^NOTE/) && // 过滤掉注释行
            !line.match(/^WEBVTT/)) { // 过滤掉WebVTT标记
          
          // 移除中文字符，只保留英文和标点
          const englishOnly = line.trim().replace(/[\u4e00-\u9fa5]/g, '').trim();
          
          // 确保保留有英文内容的行（至少包含一个英文单词）
          if (englishOnly && /[a-zA-Z]{2,}/.test(englishOnly)) {
            englishLines.push(englishOnly);
          }
        }
      }
      
      // 合并处理后的行，限制最多1000行
      const combinedText = englishLines.slice(0, 1000).join(' ');
      
      // 清理文本格式
      return combinedText
        .replace(/\s+/g, ' ')                 // 多个空格替换为单个空格
        .replace(/\s+([.,!?:;])/g, '$1')      // 移除标点前的空格
        .replace(/([.,!?:;])\s*/g, '$1 ')     // 确保标点后有一个空格
        .replace(/\s*-\s*/g, ' - ')           // 规范化破折号周围的空格
        .replace(/\s*"\s*/g, '"')             // 移除引号周围的空格
        .replace(/"\s+/g, '" ')               // 确保右引号后有空格
        .replace(/\s+"/g, ' "')               // 确保左引号前有空格
        .replace(/(\.{3})\s*/g, '$1 ')        // 处理省略号
        .replace(/\(\s*/g, '(')               // 处理左括号
        .replace(/\s*\)/g, ')')               // 处理右括号
        .replace(/\s{2,}/g, ' ')              // 再次确保没有多余空格
        .trim();
    } catch (e) {
      console.error('获取字幕文本错误:', e);
      return null;
    }
  };
  
  // 分析字幕内容
  const analyzeSubtitle = async (forceRefresh = false) => {
    // 重置缓存使用状态
    setUsingCachedResult(false);
    
    // 如果非强制刷新，检查是否有缓存
    if (!forceRefresh && contentHash) {
      const cached = checkCachedAnalysis();
      if (cached) {
        setAnalysisResult(cached);
        setLastAnalysisHash(contentHash);
        return;
      }
    }
    
    const subtitleText = getCurrentSubtitleText();
    if (!subtitleText) {
      setError("无法提取有效的字幕文本进行分析，请确保加载了字幕文件");
      return;
    }
    
    // 检查字幕文本是否包含英文内容
    const hasEnglishContent = /[a-zA-Z]{2,}/.test(subtitleText);
    if (!hasEnglishContent) {
      setError("未检测到有效的英文内容，字幕解析功能适用于英文字幕");
      return;
    }
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      // 使用LlmService分析字幕
      const { result, conversationId } = await llmService.analyzeSubtitleContent(subtitleText, conversation);
      
      // 更新组件状态
      setAnalysisResult(result);
      setConversation(conversationId);
      
      // 保存分析结果到缓存
      saveAnalysisToCache(result);
      
      // 更新最后分析的内容hash
      setLastAnalysisHash(contentHash);
      
    } catch (error) {
      console.error("字幕分析出错:", error);
      setError("字幕分析失败: " + (error.message || "未知错误"));
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  // 强制重新分析，绕过缓存
  const forceReanalyze = () => {
    analyzeSubtitle(true);
  };
  
  // 渲染分析结果
  const renderAnalysisResult = () => {
    if (isAnalyzing) {
      return (
        <div className="p-4 flex flex-col items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
          <div className="text-gray-600">正在分析字幕内容...</div>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="p-4 text-red-500">
          <div className="font-medium mb-2">分析出错</div>
          <div className="text-sm">{error}</div>
          <button 
            className="mt-4 px-3 py-1 bg-blue-500 text-white rounded text-sm"
            onClick={forceReanalyze}
          >
            重试
          </button>
        </div>
      );
    }
    
    if (!analysisResult) {
      return (
        <div className="p-4 text-center text-gray-500">
          <div>尚未分析字幕内容</div>
          <button 
            className="mt-4 px-3 py-1 bg-blue-500 text-white rounded text-sm"
            onClick={() => analyzeSubtitle()}
            disabled={!subtitleContent}
          >
            开始分析
          </button>
        </div>
      );
    }
    
    // 根据CEFR等级获取颜色
    const getDifficultyColor = (level) => {
      switch(level) {
        case 'C2': return 'bg-red-100 text-red-800';
        case 'C1': return 'bg-orange-100 text-orange-800';
        case 'B2': return 'bg-yellow-100 text-yellow-800';
        case 'B1': return 'bg-green-100 text-green-800';
        case 'A2': return 'bg-blue-100 text-blue-800';
        case 'A1': return 'bg-purple-100 text-purple-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    };
    
    return (
      <div className="p-2 overflow-auto">
        <div className="mb-3 text-sm flex justify-between items-center">
          <h3 className="font-medium">字幕语言分析</h3>
          <div className="flex items-center">
            {usingCachedResult && (
              <span className="mr-2 px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs font-medium" title="使用缓存的分析结果">
                Cache
              </span>
            )}
            <button 
              className="px-2 py-1 bg-blue-500 text-white rounded text-xs"
              onClick={forceReanalyze}
              title="强制重新分析"
            >
              刷新
            </button>
          </div>
        </div>
        
        <div className="mb-3 text-sm flex justify-between items-center">
          <span className="text-gray-600">
            已分析出 {analysisResult.length} 
            {lastAnalysisHash === contentHash && 
              <span className="text-xs text-green-600 ml-2">(Cache)</span>
            }
          </span>

        </div>
        
        {analysisResult.map((item, index) => (
          <div key={index} className="mb-4 p-3 bg-white rounded shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-lg">{item.vocabulary}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${getDifficultyColor(item.difficulty)}`}>
                {item.difficulty}
              </span>
            </div>
            
            <div className="text-sm text-gray-500 mb-1">
              <span className="mr-2">{item.part_of_speech}</span>
              <span className="font-mono">{item.phonetic}</span>
            </div>
            
            <div className="mb-2 text-gray-800 border-l-2 border-gray-300 pl-2">{item.chinese_meaning}</div>
            
            <div className="mt-1 text-xs text-gray-400 flex justify-between">
              <span>{item.type}</span>
              <span className="text-blue-500 cursor-pointer hover:underline" title="复制单词到剪贴板" 
                onClick={() => {
                  navigator.clipboard.writeText(item.vocabulary)
                    .then(() => alert(`已复制 "${item.vocabulary}" 到剪贴板`))
                    .catch(err => console.error('复制失败:', err));
                }}
              >
                复制
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="h-full flex flex-col advanced-panel">
      {/* 标签页切换 */}
      <div className="flex border-b border-gray-200 advanced-panel-tabs">
        <button
          className={`advanced-panel-tab ${activeTab === 'subtitleList' ? 'active' : ''}`}
          onClick={() => handleTabChange('subtitleList')}
        >
          <svg className="inline-block w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          字幕列表
        </button>
        <button
          className={`advanced-panel-tab ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => handleTabChange('analysis')}
        >
          <svg className="inline-block w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          字幕解析
        </button>
      </div>
      
      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden advanced-panel-content">
        {activeTab === 'subtitleList' ? (
          <div className="h-full">
            <SubtitleList 
              subtitleContent={subtitleContent}
              currentTime={currentTime}
              onSubtitleClick={onSubtitleClick}
            />
          </div>
        ) : (
          <div className="h-full overflow-auto">
            {renderAnalysisResult()}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdvancedPanel; 