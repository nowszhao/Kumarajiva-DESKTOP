import { useState, useEffect, useRef, useCallback } from 'react';
import SubtitleList from './SubtitleList';
import llmService from '../utils/LlmService';
import Toast from './Toast';

function AdvancedPanel({ subtitleContent, currentTime, onSubtitleClick }) {
  const [activeTab, setActiveTab] = useState('subtitleList'); // 'subtitleList' or 'analysis'
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [contentHash, setContentHash] = useState(null); // 用于跟踪字幕内容变化
  const [lastAnalysisHash, setLastAnalysisHash] = useState(null); // 记录最后一次分析的内容hash
  const [usingCachedResult, setUsingCachedResult] = useState(false); // 标记是否使用缓存结果
  const [toast, setToast] = useState(null); // { message, type }
  
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
    // 不再自动触发分析，改为手动点击按钮触发
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
    
    console.log("Processing subtitle content...");

    try {
      // 第1步: 检测字幕格式
      const isASS = subtitleContent.includes('[Script Info]') || subtitleContent.includes('Style:') || subtitleContent.includes('Format:');
      const isSRT = subtitleContent.includes(' --> ');
      
      console.log(`字幕格式检测: ${isASS ? 'ASS/SSA' : isSRT ? 'SRT' : '未知格式'}`);
      
      // 第2步: 根据字幕格式提取对话内容
      let extractedText = '';
      
      // 处理ASS格式
      if (isASS) {
        // 查找和处理[Events]部分，这部分包含实际对话
        const sections = subtitleContent.split(/\[[\w\s]+\]/);
        let dialogueSection = '';
        
        // 在所有部分中查找包含"Dialogue:"的部分
        for (const section of sections) {
          if (section.includes('Dialogue:')) {
            dialogueSection = section;
            break;
          }
        }
        
        if (dialogueSection) {
          const dialogueLines = dialogueSection
            .split('\n')
            .filter(line => line.includes('Dialogue:'))
            .map(line => {
              // ASS格式中对话内容通常在最后一个部分
              const parts = line.split(',');
              if (parts.length > 9) {  // 确保有足够的部分
                // 获取最后部分的文本 (通常是第10个部分开始)
                return parts.slice(9).join(',');
              }
              return '';
            });
          
          extractedText = dialogueLines.join('\n');
        } else {
          console.log("未找到对话内容部分");
          return null;
        }
      } 
      // 处理SRT格式
      else if (isSRT) {
        const lines = subtitleContent.split('\n');
        const textLines = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // 跳过时间戳和序号行
          if (line.includes(' --> ') || /^\d+$/.test(line) || !line) {
            continue;
          }
          
          textLines.push(line);
        }
        
        extractedText = textLines.join('\n');
      }
      // 未知格式，尝试通用提取
      else {
        extractedText = subtitleContent;
      }
      
      // 第3步: 清理提取的文本，只保留英文内容
      if (!extractedText) {
        console.log("提取失败，无可处理文本");
        return null;
      }
      
      // 清理各种格式标记和特殊代码
      extractedText = extractedText
        .replace(/\{[^}]*\}/g, '')          // 移除花括号中的内容
        .replace(/\\[Nn]/g, '\n')           // 替换\N和\n为实际换行
        .replace(/<[^>]*>/g, '')            // 移除HTML标签
        .replace(/\[[^\]]*\]/g, '')         // 移除方括号中的内容
        .replace(/^- /gm, '')               // 移除行首的对话标记
        .replace(/^• /gm, '')               // 移除行首的项目符号
        .replace(/=/g, ' ')                 // 替换等号为空格
        .replace(/^\s*-/gm, '')             // 移除可能的对话标记
        .replace(/^\s*•/gm, '');            // 移除可能的项目符号
      
      // 按行处理文本，提取英文内容
      const lines = extractedText.split('\n');
      const englishLines = [];
      
      for (let line of lines) {
        line = line.trim();
        
        if (!line) continue;
        
        // 检查行是否包含英文字符
        if (!/[a-zA-Z]/.test(line)) {
          continue;
        }
        
        // 替换中文字符为空格
        line = line.replace(/[\u4e00-\u9fa5]/g, ' ');
        
        // 清理因移除中文产生的多余空格
        line = line.replace(/\s+/g, ' ').trim();
        
        // 确保这一行包含至少一个英文单词
        if (/[a-zA-Z]{2,}/.test(line)) {
          englishLines.push(line);
        }
      }
      
      // 合并处理后的行
      let result = englishLines.join('\n');
      
      // 最终文本清理
      result = result
        .replace(/\s+([.,!?:;])/g, '$1')       // 移除标点前的空格
        .replace(/([.,!?:;])\s*/g, '$1 ')      // 确保标点后有一个空格
        .replace(/\s*-\s*/g, ' - ')            // 规范化破折号
        .replace(/\(\s*/g, '(')                // 处理左括号
        .replace(/\s*\)/g, ')')                // 处理右括号
        .replace(/"\s+/g, '" ')                // 确保右引号后有空格
        .replace(/\s+"/g, ' "')                // 确保左引号前有空格
        .replace(/\s{2,}/g, ' ')               // 移除多余空格
        .trim();
      
      // 结果检查
      if (!result || !/[a-zA-Z]{2,}/.test(result)) {
        console.log("提取结果不包含有效英文内容");
        return null;
      }
      
      console.log("提取结果示例:", result.substring(0, 150) + (result.length > 150 ? "..." : ""));
      return result;
    } catch (e) {
      console.error('字幕文本提取错误:', e);
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
        <div className="p-4 flex flex-col items-center justify-center">
          <div className="text-center text-gray-500 mb-4">
            <div className="mb-2 text-base">尚未分析字幕内容</div>
            <div className="text-sm text-gray-400">点击下方按钮开始分析字幕中的英文单词和短语</div>
          </div>
          <button 
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 transition-colors text-white rounded text-sm font-medium"
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
              className="px-2 py-1 bg-blue-500 text-white rounded text-xs mr-2"
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
                    .then(() => setToast({ message: `已复制 \"${item.vocabulary}\" 到剪贴板`, type: 'success' }))
                    .catch(err => {
                      console.error('复制失败:', err);
                      setToast({ message: '复制失败，请重试', type: 'error' });
                    });
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
      {/* Toast 通知 */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          duration={2000} 
          onClose={() => setToast(null)} 
        />
      )}
      {/* 标签页切换和顶部按钮区域 */}
      <div className="flex flex-col border-b border-gray-200">
        {/* 复制字幕按钮 */}
        <div className="px-3 py-2 flex justify-end">
          <button 
            className="px-2 py-1 bg-green-500 text-white rounded text-xs"
            onClick={() => {
              const subtitleText = getCurrentSubtitleText();
              if (subtitleText) {
                navigator.clipboard.writeText(subtitleText)
                  .then(() => {
                    setToast({ message: '字幕英文内容已复制到剪贴板！', type: 'success' });
                  })
                  .catch(err => {
                    console.error('复制字幕内容失败:', err);
                    setToast({ message: '复制失败，请重试', type: 'error' });
                  });
              } else {
                setToast({ message: '无法提取字幕内容', type: 'warning' });
              }
            }}
            title="复制英文字幕内容到剪贴板"
          >
            复制字幕
          </button>
        </div>
        
        {/* 标签页按钮 */}
        <div className="flex">
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