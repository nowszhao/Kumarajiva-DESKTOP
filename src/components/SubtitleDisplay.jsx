import { useState, useEffect, useRef, useCallback } from 'react';

// 导入增强的字幕解析函数
import { parseAssSubtitles } from './subtitleUtils';

// 导入字幕样式表
import '../styles/subtitle.css';

// 拖拽状态钩子 - 增加了持久化存储位置
const useDraggable = (ref, isFullscreen) => {
  // 尝试从localStorage获取保存的位置
  const getSavedPosition = useCallback(() => {
    try {
      const key = isFullscreen ? 'subtitle-position-fullscreen' : 'subtitle-position-normal';
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('读取字幕位置出错:', e);
    }
    return { x: 0, y: 0 }; // 默认位置
  }, [isFullscreen]);

  const [position, setPosition] = useState(getSavedPosition());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // 保存位置到localStorage
  const savePosition = useCallback((pos) => {
    try {
      const key = isFullscreen ? 'subtitle-position-fullscreen' : 'subtitle-position-normal';
      localStorage.setItem(key, JSON.stringify(pos));
    } catch (e) {
      console.error('保存字幕位置出错:', e);
    }
  }, [isFullscreen]);

  // 当全屏状态变化时，更新位置
  useEffect(() => {
    setPosition(getSavedPosition());
  }, [isFullscreen, getSavedPosition]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseDown = (e) => {
      // 只允许鼠标左键拖动
      if (e.button !== 0) return;
      
      e.preventDefault();
      setIsDragging(true);
      
      // 记录初始位置和鼠标坐标
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y
      };
      
      // 添加拖动中的样式类
      element.classList.add('dragging');
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      // 计算新位置
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      
      const newX = dragStartRef.current.posX + dx;
      const newY = dragStartRef.current.posY + dy;
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        
        // 移除拖动中的样式类
        element.classList.remove('dragging');
        
        // 保存位置到localStorage
        savePosition(position);
      }
    };
    
    // 添加提示信息
    const addTooltip = () => {
      element.setAttribute('title', '点击并拖拽可移动字幕位置');
    };
    addTooltip();

    // 添加事件监听
    element.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      // 移除事件监听
      element.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [ref, isDragging, position, savePosition]);

  // 双击重置位置
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    const handleDoubleClick = () => {
      setPosition({ x: 0, y: 0 });
      savePosition({ x: 0, y: 0 });
    };
    
    element.addEventListener('dblclick', handleDoubleClick);
    
    return () => {
      element.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [ref, savePosition]);

  return { position, isDragging };
};

function SubtitleDisplay({ subtitleContent, currentTime, isFullscreen = false, isBlurred = false }) {
  // Ensure isBlurred is a boolean at the start of component
  // 使用更强大的类型强制转换
  const blurEnabled = (() => {
    try {
      // 三种方式确保是布尔值:
      // 1. 严格相等比较
      // 2. 双重否定
      // 3. Boolean构造函数
      return isBlurred === true || !!isBlurred || Boolean(isBlurred);
    } catch (e) {
      console.error('字幕模糊状态处理出错:', e);
      return false; // 安全默认值
    }
  })();

  const [parsedSubtitles, setParsedSubtitles] = useState([]);
  const subtitleRef = useRef(null);
  
  // 确保useDraggable获取的参数是布尔值
  const safeIsFullscreen = typeof isFullscreen === 'boolean' ? isFullscreen : false;
  const { position, isDragging } = useDraggable(subtitleRef, safeIsFullscreen);
  
  // 解析字幕内容
  useEffect(() => {
    if (!subtitleContent) {
      setParsedSubtitles([]);
      return;
    }
    
    try {
      // 使用导入的解析函数
      const parsed = parseAssSubtitles(subtitleContent);
      
      // 确保解析结果是有效的数组
      if (Array.isArray(parsed) && parsed.length > 0) {
        setParsedSubtitles(parsed);
        console.log("字幕解析成功，共", parsed.length, "条");
      } else {
        console.warn('字幕解析结果为空或无效');
        setParsedSubtitles([]);
      }
    } catch (e) {
      console.error('字幕处理错误:', e);
      setParsedSubtitles([]);
    }
  }, [subtitleContent]);
  
  // 通过控制台输出调试信息，帮助排查问题
  // 生产环境可移除
  // 重要：将此useEffect移到组件顶层，不能在条件渲染中
  useEffect(() => {
    try {
      console.log(`[DEBUG] 字幕组件更新状态: 全屏=${safeIsFullscreen}, 模糊=${blurEnabled}, 模糊类型=${typeof isBlurred}`);
    } catch (e) {
      console.error('字幕调试日志输出错误:', e);
    }
  }, [safeIsFullscreen, blurEnabled, isBlurred]);
  
  // 根据视频时间查找当前字幕
  const getCurrentSubtitles = useCallback(() => {
    try {
      if (!currentTime || !parsedSubtitles || !Array.isArray(parsedSubtitles) || parsedSubtitles.length === 0) {
        return [];
      }
      
      const currentMs = currentTime * 1000;
      return parsedSubtitles.filter(sub => {
        try {
          // 确保字幕对象和其属性有效
          return sub && 
                 typeof sub.start === 'number' && 
                 typeof sub.end === 'number' && 
                 currentMs >= sub.start && 
                 currentMs <= sub.end;
        } catch (e) {
          console.error('字幕过滤时出错:', e);
          return false;
        }
      });
    } catch (e) {
      console.error('获取当前字幕错误:', e);
      return [];
    }
  }, [currentTime, parsedSubtitles]);
  
  const currentSubtitles = getCurrentSubtitles();
  
  // 只有在有字幕时才渲染
  if (!currentSubtitles || !Array.isArray(currentSubtitles) || currentSubtitles.length === 0) {
    return null;
  }
  
  // 预处理字幕文本，处理长行
  const processText = (text) => {
    return text;
    
    try {
      if (!text) return '';
      
      // 如果是很长的一行，尝试在标点或固定长度处换行
      if (text.length > 90 && !text.includes('<br>')) { // 增加长度阈值从80到90
        // 处理中文文本（通常没有空格）
        if (/[\u4e00-\u9fa5]/.test(text)) {
          const charsPerLine = safeIsFullscreen ? 35 : 30; // 增加每行字符数
          let formatted = '';
          let currentLineLength = 0;
          let lastBreakPoint = 0;
          
          for (let i = 0; i < text.length; i++) {
            formatted += text[i];
            currentLineLength++;
            
            // 标记潜在的断句点
            const isBreakPoint = /[。？！.,!?]/.test(text[i]);
            if (isBreakPoint) {
              lastBreakPoint = i;
            }
            
            // 只有在主要标点处换行，避免过度换行
            if (currentLineLength >= charsPerLine) {
              // 优先在最近的断句点换行
              if (lastBreakPoint > 0 && i - lastBreakPoint < 10) {
                // 回退到上一个断句点，在那里插入换行
                formatted = formatted.substring(0, formatted.length - (i - lastBreakPoint)) + 
                           '<br>' + 
                           formatted.substring(formatted.length - (i - lastBreakPoint));
                i = lastBreakPoint; // 调整当前位置
                currentLineLength = 0;
                lastBreakPoint = 0;
              } else {
                // 如果没有合适的断句点，就在当前位置换行
                formatted += '<br>';
                currentLineLength = 0;
              }
            }
          }
          return formatted;
        } 
        // 处理英文等有空格的文本
        else if (text.includes(' ')) {
          const words = text.split(' ');
          let formatted = '';
          let currentLineLength = 0;
          const maxLineLength = safeIsFullscreen ? 85 : 70; // 基于字符数而非单词数
          
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const wordWithSpace = i < words.length - 1 ? word + ' ' : word;
            
            // 计算添加这个词会使当前行到达的长度
            const newLineLength = currentLineLength + wordWithSpace.length;
            
            // 如果添加这个词会超过最大长度，并且当前行不为空，则换行
            if (newLineLength > maxLineLength && currentLineLength > 0) {
              formatted += '<br>' + word + ' ';
              currentLineLength = word.length + 1;
            } else {
              formatted += wordWithSpace;
              currentLineLength += wordWithSpace.length;
            }
            
            // 在句子结束标点后换行（但不在每个句号后都换行，避免过度换行）
            if (/[.!?]$/.test(word) && 
                i < words.length - 1 && 
                currentLineLength > maxLineLength / 2) {
              formatted += '<br>';
              currentLineLength = 0;
            }
          }
          return formatted.trim();
        }
      }
      
      return text;
    } catch (e) {
      console.error('处理字幕文本出错:', e);
      return text || ''; // 返回原始文本或空字符串
    }
  };
  
  // 根据拖动位置构建内联样式
  const getInlineStyles = () => {
    try {
      // 基础样式 - 位置变换
      const baseStyles = {
        transform: `translate(-50%, 0) translate(${position?.x || 0}px, ${position?.y || 0}px)`,
        // 添加硬件加速控制
        willChange: 'transform',
        // 使用简单的透明度替代可能引起GPU问题的模糊效果
        opacity: blurEnabled ? 0.5 : 1
      };
      
      // 使用更安全的条件检查
      // 使用更轻量的模糊效果，减少GPU负担
      if (blurEnabled) {
        return {
          ...baseStyles,
          // 降低模糊程度，从5px减少到3px
          filter: 'blur(3px)',
          WebkitFilter: 'blur(3px)', // 兼容Safari
          // 取消硬件加速以避免一些Electron渲染器的问题
          transform: `translate(-50%, 0) translate(${position?.x || 0}px, ${position?.y || 0}px) translateZ(0)`,
          // 添加适当的降低透明度替代部分模糊效果
          opacity: 0.8
        };
      }
      
      return baseStyles;
    } catch (e) {
      console.error('构建字幕样式出错:', e);
      // 返回默认样式，防止整个组件崩溃
      return { transform: 'translate(-50%, 0)' };
    }
  };
  
  // 主要渲染函数使用try-catch保护
  try {
    return (
      <div className={`subtitle-wrapper ${safeIsFullscreen ? 'fullscreen' : ''}`}>
        <div
          ref={subtitleRef}
          className={`subtitle-text draggable ${isDragging ? 'dragging' : ''} ${blurEnabled ? 'blurred' : ''}`}
          style={getInlineStyles()}
        >
          {currentSubtitles.map((subtitle, index) => {
            try {
              // 确保字幕文本有效
              const subtitleText = subtitle && subtitle.text ? subtitle.text : '';
              return (
                <div 
                  key={index}
                  className="subtitle-line"
                  dangerouslySetInnerHTML={{ 
                    __html: processText(subtitleText)
                  }}
                />
              );
            } catch (e) {
              console.error('渲染单个字幕行出错:', e);
              return null; // 跳过有问题的字幕行
            }
          })}
        </div>
      </div>
    );
  } catch (e) {
    console.error('字幕组件渲染出错:', e);
    return null; // 如果整个渲染过程失败，返回null
  }
}

export default SubtitleDisplay; 