import React, { useState, useEffect, useRef, useCallback } from 'react';

// 导入增强的字幕解析函数
import { parseAssSubtitles } from '../utils/subtitleUtils';

// 导入字幕样式表
import '../styles/subtitle.css';

// 调试日志函数
const debugLog = (message, data) => {
  // console.log(`[字幕拖拽调试] ${message}`, data || '');
};

const errorLog = (message, error) => {
  // console.error(`[字幕拖拽错误] ${message}`, error || '');
};

// 拖拽状态钩子 - 增强拖拽体验
const useDraggable = (ref, isFullscreen) => {
  // 尝试从localStorage获取保存的位置
  const getSavedPosition = useCallback(() => {
    try {
      const key = isFullscreen ? 'subtitle-position-fullscreen' : 'subtitle-position-normal';
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsedPos = JSON.parse(saved);
        debugLog('从存储中读取位置', parsedPos);
        return parsedPos;
      }
    } catch (e) {
      errorLog('读取字幕位置出错:', e);
    }
    // 使用默认位置：水平居中，垂直靠近底部
    const defaultY = isFullscreen ? 0 : 0; // 保持默认位置不变，CSS已经设置了底部位置
    debugLog(`使用默认位置 {x: 0, y: ${defaultY}}`);
    return { x: 0, y: defaultY }; // 默认位置
  }, [isFullscreen]);

  const [position, setPosition] = useState(getSavedPosition());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // 保存位置到localStorage
  const savePosition = useCallback((pos) => {
    try {
      const key = isFullscreen ? 'subtitle-position-fullscreen' : 'subtitle-position-normal';
      localStorage.setItem(key, JSON.stringify(pos));
      debugLog(`保存字幕位置成功:`, pos);
    } catch (e) {
      errorLog('保存字幕位置出错:', e);
    }
  }, [isFullscreen]);

  // 当全屏状态变化时，更新位置
  useEffect(() => {
    setPosition(getSavedPosition());
    debugLog('全屏状态变化，更新位置', { isFullscreen });
  }, [isFullscreen, getSavedPosition]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      errorLog('字幕元素不存在，无法设置拖拽');
      return;
    }

    // debugLog('初始化字幕拖拽功能', { element });

    // 确保添加拖动提示类
    element.classList.add('draggable');
    
    // 添加视觉提示
    let handle;
    if (!element.querySelector('.drag-handle')) {
      handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.innerHTML = '⋮⋮'; // 显示拖动图标
      handle.title = '拖拽移动字幕';
      element.appendChild(handle);
      debugLog('添加拖拽手柄到字幕元素');
    } else {
      handle = element.querySelector('.drag-handle');
    }

    // 确保handle能被点击
    if (handle) {
      handle.style.pointerEvents = 'auto';
      handle.style.cursor = 'grab';
    }

    // 为字幕元素添加特殊标记属性，帮助调试
    element.setAttribute('data-draggable', 'true');

    const handleMouseDown = (e) => {
      // 记录鼠标事件信息用于调试
      debugLog('鼠标按下事件', { 
        target: e.target.className,
        button: e.button,
        clientX: e.clientX,
        clientY: e.clientY,
        position
      });

      // 确保点击源是字幕本身或拖动手柄
      const isDragHandle = e.target.classList.contains('drag-handle');
      const isSubtitleText = e.target === element || element.contains(e.target);
      
      debugLog('鼠标点击目标检查', { isDragHandle, isSubtitleText });
      
      if (!isDragHandle && !isSubtitleText) {
        debugLog('点击目标不是字幕或手柄，忽略拖拽');
        return;
      }
      
      // 只允许鼠标左键拖动
      if (e.button !== 0) {
        debugLog('非左键点击，忽略拖拽');
        return;
      }
      
      // 阻止默认事件和冒泡
      e.preventDefault();
      e.stopPropagation();
      
      // 记录初始位置和鼠标坐标
      const startData = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y
      };
      
      dragStartRef.current = startData;
      debugLog('开始拖拽，记录初始状态', startData);
      
      // 添加拖动中的样式类
      element.classList.add('dragging');
      
      // 在拖动开始时添加视觉提示
      document.body.style.cursor = 'grabbing';
      
      // 立即设置拖拽状态为true
      setIsDragging(true);

      // 发送字幕开始拖拽的自定义事件
      window.dispatchEvent(new CustomEvent('subtitle-drag-start'));
      
      // 创建新的mousemove和mouseup处理函数，确保能捕获到后续事件
      const newHandleMouseMove = (moveEvent) => {
        if (!isDragging) {
          debugLog('拖拽状态为false，但收到了mousemove事件');
        }
        
        // 计算新位置
        const dx = moveEvent.clientX - dragStartRef.current.x;
        const dy = moveEvent.clientY - dragStartRef.current.y;
        
        const newX = dragStartRef.current.posX + dx;
        const newY = dragStartRef.current.posY + dy;
        
        // 调试信息 - 仅记录大幅度移动
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          debugLog('鼠标移动中', { dx, dy, newX, newY });
        }
        
        // 更新位置状态
        setPosition({ x: newX, y: newY });
        
        // 立即更新DOM，不等待状态更新
        if (element) {
          element.style.transform = `translate(-50%, 0) translate(${newX}px, ${newY}px)`;
        }
        
        // 防止事件继续传播
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
      };
      
      const newHandleMouseUp = (upEvent) => {
        debugLog('鼠标释放，结束拖拽', {
          finalPosition: { x: position.x, y: position.y },
          clientX: upEvent.clientX,
          clientY: upEvent.clientY
        });
        
        // 计算最终位置
        const dx = upEvent.clientX - dragStartRef.current.x;
        const dy = upEvent.clientY - dragStartRef.current.y;
        const finalX = dragStartRef.current.posX + dx;
        const finalY = dragStartRef.current.posY + dy;
        const finalPosition = { x: finalX, y: finalY };
        
        // 更新最终位置
        setPosition(finalPosition);
        
        // 保存到localStorage
        savePosition(finalPosition);
        
        // 重置拖拽状态
        setIsDragging(false);
        
        // 发送字幕结束拖拽的自定义事件
        window.dispatchEvent(new CustomEvent('subtitle-drag-end'));
        
        // 移除临时事件监听器
        document.removeEventListener('mousemove', newHandleMouseMove, true);
        document.removeEventListener('mouseup', newHandleMouseUp, true);
        
        // 移除拖动中的样式类
        if (element) {
          element.classList.remove('dragging');
        }
        
        // 恢复正常鼠标样式
        document.body.style.cursor = '';
        
        // 防止事件继续传播
        upEvent.preventDefault();
        upEvent.stopPropagation();
      };
      
      // 使用捕获阶段注册事件，确保能捕获到
      document.addEventListener('mousemove', newHandleMouseMove, true);
      document.addEventListener('mouseup', newHandleMouseUp, true);
      
      debugLog('临时拖拽事件处理器已注册');
    };

    // 不再需要在组件级别注册mousemove和mouseup事件
    // 因为现在我们在每次mousedown时临时添加它们

    debugLog('添加事件监听器');
    
    // 只注册mousedown事件
    element.addEventListener('mousedown', handleMouseDown, { passive: false });
    if (handle) {
      handle.addEventListener('mousedown', handleMouseDown, { passive: false });
    }

    // 添加提示信息
    const addTooltip = () => {
      element.setAttribute('title', '点击并拖拽可移动字幕位置，双击重置位置');
      // debugLog('添加字幕拖拽提示文本');
    };
    addTooltip();

    // 为了解决可能的事件冒泡问题，在父容器上也添加指针事件
    const parentOverlay = element.closest('.inner-subtitle-overlay, .external-subtitle-overlay');
    if (parentOverlay) {
      debugLog('找到字幕父容器，设置pointer-events', { parentId: parentOverlay.id });
      parentOverlay.style.pointerEvents = 'auto';
      // 强制父容器接收事件
      parentOverlay.style.zIndex = '9999';
    } else {
      errorLog('未找到字幕父容器');
    }

    // 查找可能阻止点击事件的元素并修复
    const videoContainer = document.querySelector('.custom-video-container');
    if (videoContainer) {
      debugLog('找到视频容器，确保不阻止点击事件');
      // 确保video元素上方的元素可以接收点击
      videoContainer.style.zIndex = '1';
    }

    const videoElement = document.querySelector('video');
    if (videoElement) {
      debugLog('找到视频元素，设置pointer-events为none');
      // 临时移除视频的点击事件，以防它吞噬字幕的点击
      const originalPointerEvents = videoElement.style.pointerEvents;
      videoElement.style.pointerEvents = 'none';
      
      // 创建一个MutationObserver来监控字幕元素是否被移除
      const observer = new MutationObserver((mutations) => {
        debugLog('检测到DOM变化，确保字幕仍可拖动');
      });
      
      observer.observe(document.body, { 
        childList: true,
        subtree: true
      });
      
      return () => {
        observer.disconnect();
        videoElement.style.pointerEvents = originalPointerEvents;
      };
    }

    return () => {
      debugLog('清理拖拽事件监听器');
      // 移除事件监听
      if (element) {
        element.removeEventListener('mousedown', handleMouseDown);
      }
      if (handle) {
        handle.removeEventListener('mousedown', handleMouseDown);
      }
      
      // 移除视觉样式
      document.body.style.cursor = '';
    };
  }, [ref, position, savePosition]); // 从依赖中移除isDragging

  // 双击重置位置
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    const handleDoubleClick = (e) => {
      debugLog('双击事件', {
        target: e.target.className,
        isDragHandle: e.target.classList.contains('drag-handle')
      });
      
      // 忽略非字幕区域的点击
      if (!element.contains(e.target)) {
        debugLog('点击目标不是字幕或其子元素，忽略');
        return;
      }
      
      // 恢复到默认位置（正中间）
      setPosition({ x: 0, y: 0 });
      savePosition({ x: 0, y: 0 });
      
      // 添加视觉反馈
      element.classList.add('reset-position');
      setTimeout(() => {
        element.classList.remove('reset-position');
      }, 300);
      
      debugLog('位置已重置');
      
      // 防止事件冒泡和默认行为
      e.preventDefault();
      e.stopPropagation();
    };
    
    element.addEventListener('dblclick', handleDoubleClick);
    
    return () => {
      element.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [ref, savePosition]);

  return { position, isDragging };
};

function SubtitleDisplay({ subtitleContent, currentTime, isFullscreen = false, isBlurred = false }) {
  // 组件挂载时记录日志
  useEffect(() => {
    debugLog('字幕显示组件挂载', { isFullscreen, isBlurred });
    
    // 输出DOM信息
    setTimeout(() => {
      const overlays = document.querySelectorAll('.inner-subtitle-overlay, .external-subtitle-overlay');
      if (overlays.length) {
        debugLog(`找到 ${overlays.length} 个字幕容器`);
        overlays.forEach(overlay => {
          debugLog('字幕容器样式', {
            id: overlay.id || '无ID',
            pointerEvents: window.getComputedStyle(overlay).pointerEvents,
            zIndex: window.getComputedStyle(overlay).zIndex,
            position: window.getComputedStyle(overlay).position,
            visibility: window.getComputedStyle(overlay).visibility,
            opacity: window.getComputedStyle(overlay).opacity
          });
        });
      } else {
        errorLog('未找到字幕容器');
      }
    }, 500);
    
    return () => {
      debugLog('字幕显示组件卸载');
    };
  }, [isFullscreen, isBlurred]);

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
      errorLog('字幕模糊状态处理出错:', e);
      return false; // 安全默认值
    }
  })();

  const [parsedSubtitles, setParsedSubtitles] = useState([]);
  const subtitleRef = useRef(null);
  
  // 记录ref获取情况
  useEffect(() => {
    if (subtitleRef.current) {
      debugLog('字幕DOM元素引用获取成功');
    } else {
      errorLog('字幕DOM元素引用获取失败');
    }
  }, [subtitleRef.current]);
  
  // 确保useDraggable获取的参数是布尔值
  const safeIsFullscreen = typeof isFullscreen === 'boolean' ? isFullscreen : false;
  const { position, isDragging } = useDraggable(subtitleRef, safeIsFullscreen);
  
  // Debugging for hooks - always call this hook, never conditionally
  useEffect(() => {
    debugLog('useDraggable hook result', { position, isDragging });
  }, [position, isDragging]);
  
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
        debugLog("字幕解析成功", { count: parsed.length });
      } else {
        console.warn('字幕解析结果为空或无效');
        setParsedSubtitles([]);
      }
    } catch (e) {
      errorLog('字幕处理错误:', e);
      setParsedSubtitles([]);
    }
  }, [subtitleContent]);
  
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
          errorLog('字幕过滤时出错:', e);
          return false;
        }
      });
    } catch (e) {
      errorLog('获取当前字幕错误:', e);
      return [];
    }
  }, [currentTime, parsedSubtitles]);
  
  const currentSubtitles = getCurrentSubtitles();
  
  // 预处理字幕文本，处理长行
  const processText = (text) => {
    if (!text) return '';
    
    // 将<br>标签转换为实际的换行
    // 支持不同格式的br标签: <br>, <br/>, <br />
    const processedText = text.replace(/<br\s*\/?>/gi, '\n');
    
    return processedText;
  };
  
  // 获取内联样式的函数
  const getInlineStyles = () => {
    try {
      // 基础样式 - 位置变换
      const baseStyles = {
        transform: `translate(-50%, 0) translate(${position?.x || 0}px, ${position?.y || 0}px)`,
        // 添加硬件加速控制
        willChange: isDragging ? 'transform' : 'auto',
        cursor: isDragging ? 'grabbing' : 'grab',
        // 使用简单的透明度替代可能引起GPU问题的模糊效果
        opacity: blurEnabled ? 1 : 1,
        transition: isDragging ? 'none' : 'transform 0.1s ease-out',
        touchAction: 'none',  // 禁用触摸事件默认行为
        pointerEvents: 'auto !important', // 确保字幕文本本身可以接收指针事件
        position: 'relative', // 确保定位正确
        zIndex: 9999999 // 确保在视频控件之上
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
          transform: `translate(-50%, 0) translate(${position?.x || 0}px, ${position?.y || 0}px)`
        };
      }
      
      return baseStyles;
    } catch (e) {
      errorLog('计算字幕样式出错:', e);
      return {
        pointerEvents: 'auto',
        cursor: 'grab',
        touchAction: 'none',
        zIndex: 9999999
      };
    }
  };
  
  // Return null early if no subtitles to render
  if (!currentSubtitles || !Array.isArray(currentSubtitles) || currentSubtitles.length === 0) {
    return null;
  }
  
  return (
    <div 
      className="subtitle-wrapper" 
      style={{ 
        pointerEvents: 'auto',
        zIndex: 9999999,
        position: 'relative'
      }}
      onClick={(e) => debugLog('字幕容器点击', { target: e.target.className })}
    >
      <div 
        ref={subtitleRef}
        className={`subtitle-text draggable ${blurEnabled ? 'blurred' : ''} ${isFullscreen ? 'fullscreen' : ''}`}
        style={getInlineStyles()}
        onMouseDown={(e) => {
          debugLog('直接在字幕元素上捕获鼠标按下事件', { 
            x: e.clientX, 
            y: e.clientY,
            target: e.target.className,
            currentTarget: e.currentTarget.className
          });
          e.stopPropagation(); // 恢复阻止冒泡，防止视频元素接收事件
          e.preventDefault(); // 也阻止默认行为
        }}
      >
        {currentSubtitles.map((sub, index) => (
          <div key={index} className="subtitle-line">
            {processText(sub.text).split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SubtitleDisplay; 