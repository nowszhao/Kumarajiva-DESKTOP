import { useState, useEffect, useRef } from 'react';
import { parseAssSubtitles } from './subtitleUtils';

function SubtitleList({ subtitleContent, currentTime, onSubtitleClick }) {
  const [parsedSubtitles, setParsedSubtitles] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [parseError, setParseError] = useState(null);
  const subtitleRefs = useRef({});
  const listRef = useRef(null);
  const autoScrollingRef = useRef(false);
  
  // 解析字幕内容
  useEffect(() => {
    if (subtitleContent) {
      try {
        console.log(`开始解析字幕，内容长度: ${subtitleContent.length}`);
        setParseError(null);
        const parsed = parseAssSubtitles(subtitleContent);
        setParsedSubtitles(parsed);
        setActiveIndex(-1); // 重置当前活动字幕
        
        // 如果内容不为空但解析结果为空，设置警告
        if (parsed.length === 0 && subtitleContent.length > 0) {
          console.warn("字幕内容有效但未能解析出字幕");
          setParseError("字幕文件格式可能不受支持或内容格式异常");
        } else {
          console.log(`成功解析 ${parsed.length} 条字幕`);
        }
      } catch (e) {
        console.error('字幕列表处理错误:', e);
        setParsedSubtitles([]);
        setParseError(`解析失败: ${e.message}`);
      }
    } else {
      setParsedSubtitles([]);
      setParseError(null);
    }
  }, [subtitleContent]);
  
  // 根据当前播放时间更新活动字幕
  useEffect(() => {
    if (!currentTime || !parsedSubtitles.length) return;
    
    const currentMs = currentTime * 1000;
    
    // 查找当前时间对应的字幕
    let foundIndex = -1;
    for (let i = 0; i < parsedSubtitles.length; i++) {
      if (currentMs >= parsedSubtitles[i].start && currentMs <= parsedSubtitles[i].end) {
        foundIndex = i;
        break;
      }
    }
    
    // 更新活动字幕索引
    if (foundIndex !== activeIndex) {
      setActiveIndex(foundIndex);
      
      // 滚动到当前字幕位置，但只在容器存在且未手动滚动时
      if (foundIndex >= 0 && subtitleRefs.current[foundIndex] && listRef.current) {
        // 标记为自动滚动
        autoScrollingRef.current = true;
        
        // 使用平滑滚动，但确保字幕项可见
        const subtitleElement = subtitleRefs.current[foundIndex];
        const container = listRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = subtitleElement.getBoundingClientRect();
        
        // 检查是否需要滚动
        const isVisible = (
          elementRect.top >= containerRect.top &&
          elementRect.bottom <= containerRect.bottom
        );
        
        if (!isVisible) {
          // 确保字幕上方有一些空间
          subtitleElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
        
        // 重置自动滚动标记
        setTimeout(() => {
          autoScrollingRef.current = false;
        }, 300);
      }
    }
  }, [currentTime, parsedSubtitles, activeIndex]);
  
  // 监听用户手动滚动
  useEffect(() => {
    const handleScroll = () => {
      // 如果不是自动滚动，标记为用户滚动
      if (!autoScrollingRef.current) {
        // 这里可以添加其他逻辑，比如记录用户手动滚动状态
      }
    };
    
    const listElement = listRef.current;
    if (listElement) {
      listElement.addEventListener('scroll', handleScroll);
    }
    
    return () => {
      if (listElement) {
        listElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);
  
  // 点击字幕项处理
  const handleSubtitleClick = (subtitle, index) => {
    if (onSubtitleClick) {
      try {
        // 将毫秒转换为秒并调用回调，同时设置活动索引
        const seekTime = subtitle.start / 1000;
        console.log(`点击字幕跳转至 ${formatTime(subtitle.start)} (${seekTime}秒)`);
        
        // 设置活动索引，但不依赖回调成功
        setActiveIndex(index);
        
        // 执行跳转回调
        onSubtitleClick(seekTime);
      } catch (e) {
        console.error('字幕跳转失败:', e);
      }
    }
  };
  
  // 没有字幕文件或解析有错误
  if (!parsedSubtitles || parsedSubtitles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 text-sm flex-col p-4">
        {parseError ? (
          <>
            <div className="text-yellow-500 font-medium mb-2">字幕解析警告</div>
            <div className="text-center">{parseError}</div>
            {subtitleContent && subtitleContent.length > 0 && (
              <div className="text-gray-400 mt-2 text-xs">
                文件大小: {subtitleContent.length} 字节
                <br />
                支持格式: SRT, ASS, VTT
              </div>
            )}
          </>
        ) : (
          "未加载字幕文件或字幕为空"
        )}
      </div>
    );
  }
  
  // 渲染字幕列表
  return (
    <div 
      ref={listRef} 
      className="h-full overflow-y-auto text-sm pb-2 px-1 subtitle-list"
      style={{ 
        scrollBehavior: 'smooth',
        height: '100%',
        minHeight: '100%',
        display: 'block'
      }}
    >
      {parsedSubtitles.map((subtitle, index) => (
        <div
          key={index}
          ref={el => subtitleRefs.current[index] = el}
          className={`p-2 mb-1 rounded-md cursor-pointer hover:bg-gray-100 ${
            index === activeIndex ? 'active-subtitle' : ''
          }`}
          onClick={() => handleSubtitleClick(subtitle, index)}
          id={`subtitle-item-${index}`}
        >
          <div className="text-xs text-gray-500 mb-1">
            {formatTime(subtitle.start)} - {formatTime(subtitle.end)}
          </div>
          <div
            className="text-gray-800"
            dangerouslySetInnerHTML={{ 
              __html: stripHtmlExceptBr(subtitle.text) 
            }}
          />
        </div>
      ))}
    </div>
  );
}

// 将毫秒转为时间格式 HH:MM:SS
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// 移除HTML标签但保留<br>
function stripHtmlExceptBr(html) {
  if (!html) return '';
  return html.replace(/<(?!br\s*\/?)[^>]+>/gi, '');
}

export default SubtitleList; 