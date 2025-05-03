import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import SubtitleList from './SubtitleList';


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
  
  // 创建LLM会话
  const createConversation = async () => {
    try {
      const response = await axios.post('http://47.121.117.100:3000/api/llm/conversation/create', {
        agentId: "naQivTmsDa",
        cookie: "_qimei_uuid42=193010b053510040bdbe959987347987350c2698a9; hy_source=web; _qimei_fingerprint=579ad3031f0737dafe77266cbcb409d8; _qimei_i_3=66c04685c60e02dac5c4fe615b8626e3f2b8f6a04409578be2de7b5e2e93753e626a3f973989e2a0d790; _qimei_h38=72e5991abdbe9599873479870300000f019301; hy_user=changhozhao; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; _qimei_i_1=4cde5185970f55d2c896af620fd626e9f2e7adf915580785bd872f582593206c616361953980e1dcd784a1e7; hy_source=web; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; hy_user=changhozhao"
      });
      
      if (response.data.success) {
        console.log("创建LLM会话成功:", response.data.data.id);
        return response.data.data.id;
      } else {
        throw new Error("创建会话失败: " + JSON.stringify(response.data));
      }
    } catch (error) {
      console.error("创建LLM会话出错:", error);
      setError("创建AI分析会话失败: " + (error.message || "未知错误"));
      return null;
    }
  };
  
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
      // 确保有会话ID
      let conversationId = conversation;
      if (!conversationId) {
        conversationId = await createConversation();
        setConversation(conversationId);
      }
      
      if (!conversationId) {
        throw new Error("未能创建有效的分析会话");
      }
      
      // 构建分析提示
      const prompt = `
###
你现在一位翻译专家，现在正帮我理解一个英语字幕文件，要求如下：
1、您的任务是翻译和分析给定文本中的语言难点，这些难点可能包括对非母语学习者具有挑战性的词汇、短语、俚语、缩写、简写以及网络用语等。
2、输出请遵循以下要求：
    - 类型：包括单词、短语/词块、俚语、缩写（Words, Phrases, Slang, Abbreviations）
    - 词汇：识别出句子中所有词汇，包括短语/词块、俚语、缩写
    - 难度：使用CEFR评级（C2, C1, B2, B1, A2, A1），从高到低排序
    - 词性：使用n., v., adj., adv., phrase等标准缩写
    - 音标：提供美式音标
    - 中文解释：根据字幕语境给出最贴切的含义
    - 中英混合句子：使用词汇造一个句子，中文句子除了该词汇外，其他均为中文，需要保证语法正确，通过在完整中文语境中嵌入单一核心英语术语，帮助学习者直观理解专业概念的实际用法；英语句子在括号中展示。
3、输出格式为json数组，示例如下：
[
    {
        "type": "Words",
        "vocabulary": "ubiquitous",
        "difficulty": "C1",
        "part_of_speech": "adj.",
        "phonetic": "/juːˈbɪkwɪtəs/",
        "chinese_meaning": "无处不在的",
        "chinese_english_sentence": "在当今的数字时代，智能手机已经ubiquitous，使人们更容易保持联系。(In today's digital age, smartphones have become ubiquitous, significantly enhancing people's ability to maintain social connections.)"
    }
]

4、其他注意事项：
- 优先选择在语境中确实影响理解的表达，而不仅仅是生僻词
- 如遇同等难度的表达，优先选择在日常生活或学习中更有用的

以下是需要分析的字幕文本：
${subtitleText}
###
`;

      console.log("发送分析请求，会话ID:", conversationId);
      const response = await axios.post(`http://47.121.117.100:3000/api/llm/chat/${conversationId}`, {
        prompt: prompt,
        agentId: "naQivTmsDa",
        model: "gpt_175B_0404",
        cookie: "_qimei_uuid42=193010b053510040bdbe959987347987350c2698a9; hy_source=web; _qimei_fingerprint=579ad3031f0737dafe77266cbcb409d8; _qimei_i_3=66c04685c60e02dac5c4fe615b8626e3f2b8f6a04409578be2de7b5e2e93753e626a3f973989e2a0d790; _qimei_h38=72e5991abdbe9599873479870300000f019301; hy_user=changhozhao; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; _qimei_i_1=4cde5185970f55d2c896af620fd626e9f2e7adf915580785bd872f582593206c616361953980e1dcd784a1e7; hy_source=web; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; hy_user=changhozhao"
      });
      
      if (response.data.success) {
        console.log("分析结果:", response.data);
        try {
          // 尝试解析返回的JSON
          const content = response.data.data.content;
          
          // 查找JSON数据
          let jsonData = null;
          const jsonMatch = content.match(/\[\s*\{.+\}\s*\]/s);
          
          if (jsonMatch) {
            jsonData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("无法从响应中提取JSON数据");
          }
          
          if (Array.isArray(jsonData) && jsonData.length > 0) {
            setAnalysisResult(jsonData);
            // 保存分析结果到缓存
            saveAnalysisToCache(jsonData);
            // 更新最后分析的内容hash
            setLastAnalysisHash(contentHash);
          } else {
            setError("解析结果为空或格式不正确");
          }
        } catch (parseError) {
          console.error("解析AI响应JSON错误:", parseError);
          setError("解析分析结果出错: " + parseError.message);
        }
      } else {
        throw new Error("AI分析请求失败: " + JSON.stringify(response.data));
      }
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
          <div className="flex gap-1">
            {['C2', 'C1', 'B2', 'B1', 'A2', 'A1'].map(level => (
              <span key={level} className={`text-xs px-1.5 py-0.5 rounded-sm ${getDifficultyColor(level)}`} title={`${level} 级别`}>
                {level}
              </span>
            ))}
          </div>
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
            
            <div className="text-sm bg-gray-50 p-2 rounded">
              <p className="text-gray-700">{item.chinese_english_sentence}</p>
            </div>
            
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