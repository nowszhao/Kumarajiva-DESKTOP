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

function SubtitleDisplay({ subtitleContent, currentTime, isFullscreen = false }) {
  const [parsedSubtitles, setParsedSubtitles] = useState([]);
  const subtitleRef = useRef(null);
  const { position, isDragging } = useDraggable(subtitleRef, isFullscreen);
  
  // 解析字幕内容
  useEffect(() => {
    if (subtitleContent) {
      try {
        // 使用导入的解析函数
        const parsed = parseAssSubtitles(subtitleContent);
        setParsedSubtitles(parsed);
        console.log("字幕解析成功，共", parsed.length, "条");
      } catch (e) {
        console.error('字幕处理错误:', e);
        setParsedSubtitles([]);
      }
    } else {
      setParsedSubtitles([]);
    }
  }, [subtitleContent]);
  
  // 根据视频时间查找当前字幕
  const getCurrentSubtitles = () => {
    try {
      if (!currentTime || !parsedSubtitles.length) return [];
      
      const currentMs = currentTime * 1000;
      return parsedSubtitles.filter(sub => 
        currentMs >= sub.start && currentMs <= sub.end
      );
    } catch (e) {
      console.error('获取当前字幕错误:', e);
      return [];
    }
  };
  
  const currentSubtitles = getCurrentSubtitles();
  
  // 只有在有字幕时才渲染
  if (currentSubtitles.length === 0) {
    return null;
  }
  
  // 预处理字幕文本，处理长行
  const processText = (text) => {
    if (!text) return '';
    
    // 如果是很长的一行，尝试在标点或固定长度处换行
    if (text.length > 50 && !text.includes('<br>')) {
      // 处理中文文本（通常没有空格）
      if (/[\u4e00-\u9fa5]/.test(text)) {
        const charsPerLine = isFullscreen ? 22 : 18; // 全屏模式每行字符数更多
        let formatted = '';
        for (let i = 0; i < text.length; i++) {
          formatted += text[i];
          // 每 charsPerLine 个字符或遇到句号等标点后添加换行
          if ((i + 1) % charsPerLine === 0 || 
              (i < text.length - 1 && /[。？！，；：]/.test(text[i]))) {
            formatted += '<br>';
          }
        }
        return formatted;
      } 
      // 处理英文等有空格的文本
      else if (text.includes(' ')) {
        const wordsPerLine = isFullscreen ? 10 : 8; // 全屏模式每行单词数更多
        return text
          .split(' ')
          .reduce((result, word, idx, arr) => {
            result += word;
            // 每指定单词数或句点后添加换行
            if (idx > 0 && idx < arr.length - 1 && 
                (idx % wordsPerLine === 0 || /[.!?;:]$/.test(word))) {
              result += '<br>';
            } else if (idx < arr.length - 1) {
              result += ' ';
            }
            return result;
          }, '');
      }
    }
    
    return text;
  };
  
  // 根据拖动位置构建内联样式
  const getInlineStyles = () => {
    return {
      transform: `translate(-50%, 0) translate(${position.x}px, ${position.y}px)`
    };
  };
  
  return (
    <div className={`subtitle-wrapper ${isFullscreen ? 'fullscreen' : ''}`}>
      <div
        ref={subtitleRef}
        className={`subtitle-text draggable ${isDragging ? 'dragging' : ''}`}
        style={getInlineStyles()}
      >
        {currentSubtitles.map((subtitle, index) => (
          <div 
            key={index}
            className="subtitle-line"
            dangerouslySetInnerHTML={{ 
              __html: processText(subtitle.text)
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default SubtitleDisplay; 