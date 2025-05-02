import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import SubtitleDisplay from './SubtitleDisplay';
import SubtitleList from './SubtitleList';
import { parseAssSubtitles } from './subtitleUtils';
import '../styles/subtitle.css';

// 添加全局调试日志函数
const debug = (message, data) => {
  // 减少日志输出，只在开发环境或明确启用时记录
  if (process.env.NODE_ENV === 'development' || localStorage.getItem('enablePlayerDebug') === 'true') {
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(`[${timestamp}] 🎬 ${message}`, data || '');
  }
};

const error = (message, err) => {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.error(`[${timestamp}] ❌ ${message}`, err || '');
};

// 判断是否在Electron环境中
const isElectron = () => {
  return window.navigator && window.navigator.userAgent.includes('Electron');
};

function PlayerPanel({ currentVideo, currentSubtitle, subtitleContent }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showSubtitleList, setShowSubtitleList] = useState(true);
  const [videoStatus, setVideoStatus] = useState('idle'); // idle, loading, playing, error
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSubtitleTip, setShowSubtitleTip] = useState(false);
  const [isLoopingSubtitle, setIsLoopingSubtitle] = useState(false);
  const [parsedSubtitles, setParsedSubtitles] = useState([]);
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
  const [isPaused, setIsPaused] = useState(false);
  const lastActiveTimeRef = useRef(Date.now());
  const autoResumeRef = useRef(null);
  const videoWatchdogRef = useRef(null);
  const forcePlayTimerRef = useRef(null);
  const lastPlayedTimeRef = useRef(0);
  const playAttemptCountRef = useRef(0);

  // 初始化视频看门狗系统
  useEffect(() => {
    // 仅在挂载时执行一次
    debug("初始化视频看门狗系统");
    
    // 设置一个清理函数，确保所有计时器在组件卸载时被清除
    return () => {
      if (videoWatchdogRef.current) {
        clearInterval(videoWatchdogRef.current);
        videoWatchdogRef.current = null;
      }
      
      if (autoResumeRef.current) {
        clearTimeout(autoResumeRef.current);
        autoResumeRef.current = null;
      }
      
      if (forcePlayTimerRef.current) {
        clearTimeout(forcePlayTimerRef.current);
        forcePlayTimerRef.current = null;
      }
    };
  }, []);
  
  // 启动视频看门狗功能
  const startVideoWatchdog = () => {
    if (videoWatchdogRef.current) {
      clearInterval(videoWatchdogRef.current);
    }
    
    debug("启动视频看门狗");
    videoWatchdogRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || !currentVideo) return;
      
      const now = Date.now();
      const timeSinceLastActivity = now - lastActiveTimeRef.current;
      const currentVideoTime = video.currentTime;
      const videoTimeFrozen = currentVideoTime === lastPlayedTimeRef.current;
      
      // 视频已暂停，但用户没有主动暂停，且视频已加载好
      if (video.paused && !isPaused && video.readyState >= 3) {
        debug(`视频意外暂停，尝试恢复播放 (冻结: ${videoTimeFrozen}, 经过: ${timeSinceLastActivity}ms)`);
        attemptResumePlayback();
      } 
      // 视频播放中但时间没有变化（卡住了）
      else if (!video.paused && videoTimeFrozen && timeSinceLastActivity > 3000) {
        debug(`视频播放卡住，尝试解除冻结 (当前时间: ${currentVideoTime}s)`);
        // 轻微调整当前时间，尝试触发解冻
        try {
          // 向前微调0.1秒
          video.currentTime = currentVideoTime + 0.1;
          updateLastActiveTime();
        } catch (e) {
          error("尝试解冻视频失败", e);
        }
      }
      
      // 更新上次播放时间记录
      lastPlayedTimeRef.current = currentVideoTime;
    }, 3000); // 每3秒检查一次
  };
  
  // 停止视频看门狗
  const stopVideoWatchdog = () => {
    if (videoWatchdogRef.current) {
      clearInterval(videoWatchdogRef.current);
      videoWatchdogRef.current = null;
    }
  };
  
  // 尝试恢复播放
  const attemptResumePlayback = () => {
    const video = videoRef.current;
    if (!video || isPaused) return;
    
    playAttemptCountRef.current += 1;
    
    // 清除任何现有的自动恢复定时器
    if (autoResumeRef.current) {
      clearTimeout(autoResumeRef.current);
    }
    
    // 延迟恢复播放
    autoResumeRef.current = setTimeout(() => {
      try {
        debug(`尝试恢复播放 (第${playAttemptCountRef.current}次)`);
        
        // 在Electron环境中，使用特殊修复
        if (isElectron()) {
          // 尝试重设视频源来刷新播放状态
          if (playAttemptCountRef.current > 2) {
            const currentSrc = video.src;
            const currentTime = video.currentTime;
            debug("使用源重置方法恢复播放");
            
            // 暂时移除src然后重设
            video.pause();
            const tempSrc = video.src;
            video.removeAttribute('src');
            
            // 强制回流
            void video.offsetHeight;
            
            // 重设src并恢复播放位置
            setTimeout(() => {
              video.src = tempSrc;
              video.load();
              
              video.addEventListener('loadedmetadata', function onLoaded() {
                video.currentTime = currentTime;
                video.removeEventListener('loadedmetadata', onLoaded);
                video.play().then(() => {
                  debug("重置源后成功恢复播放");
                  playAttemptCountRef.current = 0;
                }).catch(e => error("重置源后播放失败", e));
              }, { once: true });
            }, 100);
            
            updateLastActiveTime();
            return;
          }
        }
        
        // 标准恢复尝试
        video.play().then(() => {
          debug("成功恢复播放");
          setIsPaused(false);
          updateLastActiveTime();
          
          // 如果成功恢复，重置尝试计数
          if (playAttemptCountRef.current >= 2) {
            playAttemptCountRef.current = 0;
          }
        }).catch(e => {
          error("恢复播放失败", e);
          
          // 如果常规方法失败，尝试更激进的方法
          if (playAttemptCountRef.current >= 3) {
            debug("尝试更激进的恢复方法");
            
            // 如果是HLS视频，尝试重新加载HLS实例
            if (hlsRef.current && typeof hlsRef.current.startLoad === 'function') {
              debug("重新加载HLS流");
              try {
                hlsRef.current.stopLoad();
                hlsRef.current.startLoad();
                
                setTimeout(() => {
                  video.play().catch(() => {
                    debug("重载HLS后播放失败，降级到重置播放器");
                    resetPlayer();
                  });
                }, 500);
              } catch (hlsErr) {
                error("HLS重载失败", hlsErr);
                resetPlayer();
              }
            } else {
              // 最后的手段：重置整个播放器
              debug("降级到重置播放器");
              resetPlayer();
            }
            
            playAttemptCountRef.current = 0;
          }
        });
      } catch (e) {
        error("恢复播放出错", e);
      }
      
      autoResumeRef.current = null;
    }, 500);
  };
  
  // 更新当前视频活动时间
  const updateLastActiveTime = () => {
    lastActiveTimeRef.current = Date.now();
  };

  // 解析字幕内容
  useEffect(() => {
    if (subtitleContent) {
      try {
        // 使用同样的解析函数解析字幕
        console.log('[DEBUG] 开始解析字幕内容，字幕长度:', subtitleContent.length);
        console.log('[DEBUG] 字幕内容前100个字符:', subtitleContent.substring(0, 100).replace(/\n/g, '\\n'));
        
        // 将字幕内容保存到localStorage供调试
        try {
          localStorage.setItem('debug_subtitle_content', subtitleContent.substring(0, 4000));
          console.log('[DEBUG] 已保存字幕内容到localStorage供调试');
          
          // 保存到本地文件供详细调试 - 如果在Electron环境
          if (window.electronAPI && window.electronAPI.debugSaveSubtitle) {
            console.log('[DEBUG] 尝试保存字幕内容到本地文件');
            window.electronAPI.debugSaveSubtitle(subtitleContent)
              .then(() => console.log('[DEBUG] 字幕内容已保存到本地文件'))
              .catch(err => console.error('[ERROR] 保存字幕内容失败:', err));
          }
        } catch (err) {
          console.error('[ERROR] 保存字幕内容到localStorage失败:', err);
        }
        
        // 使用增强的subtitleUtils解析字幕 - 会自动检测并解析各种格式
        const parsed = parseAssSubtitles(subtitleContent);
        
        console.log(`[DEBUG] 字幕解析结果: ${parsed ? parsed.length : 0}条字幕`, {
          parsed,
          firstItem: parsed && parsed.length > 0 ? parsed[0] : null,
          lastItem: parsed && parsed.length > 0 ? parsed[parsed.length - 1] : null
        });
        
        if (parsed && parsed.length > 0) {
          setParsedSubtitles(parsed);
          console.log(`[DEBUG] 字幕控制器解析成功，共${parsed.length}条`);
        } else {
          console.warn('[WARN] 字幕解析结果为空，创建占位字幕');
          // 即使解析失败，也创建一个占位字幕以便显示控制按钮
          setParsedSubtitles([{
            start: 0,
            end: 10000,
            text: '字幕解析失败，但控制按钮已启用'
          }]);
        }
      } catch (e) {
        console.error('[ERROR] 字幕控制器解析错误:', e);
        // 确保设置为空数组，而不是undefined或null
        setParsedSubtitles([{
          start: 0,
          end: 10000,
          text: '字幕解析出错: ' + e.message
        }]);
      }
    } else {
      console.log('[DEBUG] 无字幕内容，重置字幕状态');
      setParsedSubtitles([]);
    }
  }, [subtitleContent]);
  
  // 更新当前字幕索引
  useEffect(() => {
    if (!currentTime || !parsedSubtitles || !Array.isArray(parsedSubtitles) || !parsedSubtitles.length) {
      setCurrentSubtitleIndex(-1);
      return;
    }
    
    const currentMs = currentTime * 1000;
    
    // 对大型字幕数据使用高效率查找方法
    let foundIndex = -1;
    
    // 针对大量字幕进行优化 (>100条)
    if (parsedSubtitles.length > 100) {
      // 从当前索引开始查找，利用时间连续性
      if (currentSubtitleIndex >= 0 && currentSubtitleIndex < parsedSubtitles.length) {
        const current = parsedSubtitles[currentSubtitleIndex];
        // 检查当前字幕是否仍然有效
        if (current && typeof current.start === 'number' && typeof current.end === 'number') {
          if (currentMs >= current.start && currentMs <= current.end) {
            // 当前字幕仍然有效，不需要更改
            return;
          }
          
          // 查看下一个字幕是否匹配（通常的情况）
          if (currentSubtitleIndex + 1 < parsedSubtitles.length) {
            const next = parsedSubtitles[currentSubtitleIndex + 1];
            if (next && typeof next.start === 'number' && typeof next.end === 'number') {
              if (currentMs >= next.start && currentMs <= next.end) {
                setCurrentSubtitleIndex(currentSubtitleIndex + 1);
                return;
              }
            }
          }
        }
      }
      
      // 使用二分查找提高性能
      let low = 0;
      let high = parsedSubtitles.length - 1;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        
        // 添加安全检查
        if (!parsedSubtitles[mid] || typeof parsedSubtitles[mid].start !== 'number') {
          break;
        }
        
        const start = parsedSubtitles[mid].start;
        const end = parsedSubtitles[mid].end || (start + 5000); // 默认5秒
        
        if (currentMs >= start && currentMs <= end) {
          // 找到匹配的字幕
          foundIndex = mid;
          break;
        } else if (start > currentMs) {
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
    } 
    // 对于较少的字幕数据，使用线性查找
    else {
      // 查找当前时间对应的字幕
      for (let i = 0; i < parsedSubtitles.length; i++) {
        // 添加安全检查
        if (!parsedSubtitles[i] || typeof parsedSubtitles[i].start !== 'number') {
          continue;
        }
        
        if (currentMs >= parsedSubtitles[i].start && currentMs <= parsedSubtitles[i].end) {
          foundIndex = i;
          break;
        }
      }
    }
    
    // 更新当前字幕索引
    if (foundIndex !== currentSubtitleIndex) {
      setCurrentSubtitleIndex(foundIndex);
    }
  }, [currentTime, parsedSubtitles, currentSubtitleIndex]);
  
  // 监控字幕循环
  useEffect(() => {
    // 打印简单的初始状态日志
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] 字幕循环状态:', isLoopingSubtitle ? '已启用' : '已禁用');
    }
    
    // 如果未启用循环，直接退出
    if (!isLoopingSubtitle) return;
    
    // 使用setInterval而不是事件监听
    const intervalId = setInterval(() => {
      try {
        const video = videoRef.current;
        if (!video || video.paused) return;
        
        // 极简版本 - 只执行最基本的功能，避免任何可能的复杂操作
        if (currentSubtitleIndex >= 0 && 
            parsedSubtitles && 
            currentSubtitleIndex < parsedSubtitles.length) {
          
          const currentMs = video.currentTime * 1000;
          const subtitle = parsedSubtitles[currentSubtitleIndex];
          
          if (subtitle && 
              typeof subtitle.start === 'number' && 
              typeof subtitle.end === 'number' && 
              currentMs > subtitle.end) {
            
            // 简单直接设置时间，不使用复杂的callback
            try {
              video.currentTime = subtitle.start / 1000;
            } catch (e) {
              // 静默失败，不执行额外操作
            }
          }
        }
      } catch (e) {
        // 捕获错误但不执行复杂处理
      }
    }, 250); // 每250ms检查一次，降低CPU使用
    
    // 简单的清理函数
    return () => {
      clearInterval(intervalId);
    };
  }, [isLoopingSubtitle, currentSubtitleIndex, parsedSubtitles]);

  // 显示字幕提示
  useEffect(() => {
    if (subtitleContent && !localStorage.getItem('subtitle-tip-shown')) {
      setShowSubtitleTip(true);
      
      // 5秒后自动关闭提示
      const timer = setTimeout(() => {
        setShowSubtitleTip(false);
        localStorage.setItem('subtitle-tip-shown', 'true');
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [subtitleContent]);

  useEffect(() => {
    debug('视频组件挂载或更新', { currentVideo: currentVideo?.name });
    const video = videoRef.current;
    
    if (!video) {
      error('视频DOM元素不存在');
      return;
    }
    
    // Electron环境下添加视频显示修复
    const applyElectronHacks = () => {
      debug("应用Electron视频兼容性修复");
      
      // 强制GPU加速和显示层重建
      if (video.style) {
        video.style.transform = 'translateZ(0)';
        video.style.backfaceVisibility = 'hidden';
        
        // 对于macOS，添加特殊处理
        if (navigator.platform.indexOf('Mac') > -1) {
          debug("检测到macOS，应用特殊修复");
          
          // 通过触发resize事件修复显示
          const triggerResize = () => {
            window.dispatchEvent(new Event('resize'));
          };
          
          // 当视频可以播放时，触发重绘
          const redrawVideo = () => {
            // 短暂隐藏再显示，强制重绘
            const originalDisplay = video.style.display;
            video.style.display = 'none';
            
            // 强制回流和重绘
            void video.offsetHeight;
            setTimeout(() => {
              video.style.display = originalDisplay;
              triggerResize();
            }, 50);
          };
          
          video.addEventListener('canplay', redrawVideo, { once: true });
          video.addEventListener('playing', triggerResize, { once: true });
        }
      }
    };
    
    // 应用修复
    applyElectronHacks();
    
    // 添加视频元素事件监听器
    const setupVideoListeners = () => {
      const videoEvents = [
        'loadstart', 'durationchange', 'loadedmetadata', 'loadeddata', 'progress', 
        'canplay', 'canplaythrough', 'playing', 'waiting', 'stalled'
      ];
      
      // 先移除所有现有事件监听器，避免重复
      videoEvents.forEach(eventName => {
        video.removeEventListener(eventName, () => {});
      });
      
      // 添加新的事件监听器
      videoEvents.forEach(eventName => {
        video.addEventListener(eventName, () => {
          debug(`视频事件: ${eventName}`, { 
            readyState: video.readyState,
            networkState: video.networkState,
            duration: video.duration,
            currentSrc: video.currentSrc && video.currentSrc.slice(0, 100) + '...',
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
          });
          
          // 检测到视频成功显示后更新状态
          if (eventName === 'canplay' || eventName === 'canplaythrough' || eventName === 'playing') {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              debug("视频尺寸有效，更新状态为playing");
              setVideoStatus('playing');
            }
          }
        });
      });
      
      // 特殊处理错误事件
      video.addEventListener('error', (e) => {
        const errorCodes = {
          1: 'MEDIA_ERR_ABORTED',
          2: 'MEDIA_ERR_NETWORK',
          3: 'MEDIA_ERR_DECODE',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
        };
        
        const videoError = video.error;
        error('视频错误事件', { 
          code: videoError ? errorCodes[videoError.code] || videoError.code : 'unknown',
          message: videoError ? videoError.message : 'No error details',
          event: e
        });
        setVideoStatus('error');
      });
    };
    
    setupVideoListeners();
    debug('已设置视频事件监听器');
    
    // 清理函数
    const cleanup = () => {
      debug('执行清理', { hasHls: !!hlsRef.current });
      
      if (hlsRef.current) {
        debug("销毁HLS实例");
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      if (video) {
        debug("清理视频元素", { src: video.src ? 'has src' : 'no src' });
        video.pause();
        
        try {
          video.removeAttribute('src');
          debug("已移除视频src属性");
        } catch (e) {
          error("移除src属性出错", e);
        }
        
        try {
        video.load();
          debug("已重置视频加载状态");
        } catch (e) {
          error("视频加载重置出错", e);
        }
        
        setVideoStatus('idle');
      }
    };
    
    // 如果没有视频，执行清理
    if (!currentVideo?.url) {
      debug('无视频URL，执行清理');
      cleanup();
      return cleanup;
    }
    
    // 先清理之前的实例
    cleanup();
    setVideoStatus('loading');
    
    // 播放新视频
    const playVideo = () => {
      debug("开始加载新视频", { url: currentVideo.url.substring(0, 100) + '...' });
      
      try {
        // 检查视频元素状态
        debug("视频元素当前状态", { 
          readyState: video.readyState,
          networkState: video.networkState,
          paused: video.paused
        });
        
        // 设置错误处理
        const handleVideoError = (e) => {
          error("视频加载错误", e);
          setVideoStatus('error');
          // 显示一个占位符或错误提示
          if (videoRef.current) {
            debug("设置错误占位图");
            videoRef.current.poster = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif' font-size='14px' fill='%23fff'%3E视频加载失败%3C/text%3E%3C/svg%3E";
          }
        };
        
        video.addEventListener('error', handleVideoError);
        
        // 基于URL类型选择适当的播放方式
        if (currentVideo.url.includes('.m3u8')) {
          debug("检测到HLS格式视频");
          
          // 使用HLS.js播放m3u8
          if (Hls.isSupported()) {
            debug("使用HLS.js播放");
            
            const hls = new Hls({
              debug: false, // 禁用HLS调试以减少日志
              maxBufferLength: 60, // 增加缓冲区大小
              maxMaxBufferLength: 120, // 增加最大缓冲区大小
              fragLoadingMaxRetry: 8, // 增加片段加载重试次数
              manifestLoadingMaxRetry: 8, // 增加清单加载重试次数
              levelLoadingMaxRetry: 8, // 增加级别加载重试次数
              fragLoadingRetryDelay: 1000, // 片段加载重试延迟
              manifestLoadingRetryDelay: 1000, // 清单加载重试延迟
              levelLoadingRetryDelay: 1000, // 级别加载重试延迟
              // 添加更多配置以提高稳定性
              startLevel: -1,  // 自动选择最佳质量
              abrEwmaDefaultEstimate: 500000, // 默认带宽估计 (500 kbps)
              abrBandWidthFactor: 0.8, // 带宽因子，降低可以提高稳定性
              abrBandWidthUpFactor: 0.7, // 带宽上升因子
              liveSyncDurationCount: 3,
              liveMaxLatencyDurationCount: 10,
              enableWorker: true, // 启用Web Worker提高性能
              // 不要因为小错误就中断播放
              disableVideoTagFallback: false,
              lowLatencyMode: false, // 禁用低延迟模式提高稳定性
              backBufferLength: 60, // 增加后缓冲区长度
              progressive: true, // 启用渐进式加载
              testBandwidth: true, // 测试带宽
              // 错误恢复设置
              enableSoftwareAES: true, // 允许软件AES
              // 媒体选项
              capLevelToPlayerSize: true, // 限制视频质量以匹配播放器大小
              maxLevelCappingMode: 'downscale' // 当超过最大level时降级
            });
            hlsRef.current = hls;
            
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
              debug("HLS: 媒体已连接");
            });
            
            hls.on(Hls.Events.MANIFEST_LOADING, () => {
              debug("HLS: 正在加载清单");
            });
            
            hls.on(Hls.Events.MANIFEST_LOADED, () => {
              debug("HLS: 清单已加载");
            });
            
            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
              debug("HLS: 清单已解析", data);
              debug("尝试播放视频");
              
              video.play().then(() => {
                debug("视频开始播放");
                setVideoStatus('playing');
              }).catch(e => {
                error("播放失败", e);
                
                // 尝试静音播放（绕过某些自动播放限制）
                debug("尝试静音播放");
                video.muted = true;
                
                video.play().then(() => {
                  debug("静音播放成功");
                  setVideoStatus('playing');
                }).catch(e2 => {
                  error("静音播放也失败", e2);
                  handleVideoError(e2);
                });
              });
            });
            
            hls.on(Hls.Events.FRAG_LOADING, () => {
              debug("HLS: 加载片段中");
            });
            
            hls.on(Hls.Events.FRAG_LOADED, () => {
              debug("HLS: 片段已加载");
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
              error("HLS错误", data);
              
              if (data.fatal) {
                switch(data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    debug("网络错误，尝试恢复");
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    debug("媒体错误，尝试恢复");
                    hls.recoverMediaError();
                    break;
                  default:
                    error("无法恢复的错误，清理实例");
                    
                    // 尝试使用降级的方法加载视频
                    if (video.canPlayType('application/vnd.apple.mpegurl')) {
                      debug("尝试降级为原生播放器");
                      try {
                        video.src = currentVideo.url;
                        video.play().catch(e => {
                          error("降级播放也失败", e);
                          cleanup();
                          handleVideoError(new Error("无法播放视频: " + data.details));
                        });
                        return;
                      } catch (e) {
                        error("降级播放失败", e);
                      }
                    }
                    
                    cleanup();
                    // 显示错误信息
                    handleVideoError(new Error("无法播放视频: " + data.details));
                    break;
                }
              } else {
                // 非致命错误，仅记录
                debug("非致命HLS错误，继续播放", data.details);
              }
            });
            
            // 开始加载
            debug("准备加载HLS源", { url: currentVideo.url.substring(0, 100) + '...' });
            
            try {
            hls.loadSource(currentVideo.url);
              debug("HLS源加载请求已发送");
              
            hls.attachMedia(video);
              debug("HLS已绑定到视频元素");
            } catch (e) {
              error("HLS加载或绑定失败", e);
              handleVideoError(e);
            }
          } 
          // Safari 原生支持HLS
          else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            debug("使用浏览器原生HLS支持");
            
            try {
            video.src = currentVideo.url;
              debug("已设置视频源");
              
              video.play().then(() => {
                debug("原生HLS播放成功");
                setVideoStatus('playing');
              }).catch(e => {
                error("原生播放失败", e);
                handleVideoError(e);
              });
            } catch (e) {
              error("设置原生HLS源失败", e);
              handleVideoError(e);
            }
          } 
          // 不支持HLS的情况
          else {
            error("此浏览器不支持HLS");
            handleVideoError(new Error("浏览器不支持HLS"));
          }
        } 
        // 普通视频
        else {
          debug("加载普通视频");
          
          try {
          video.src = currentVideo.url;
            debug("已设置普通视频源");
            
          video.load();
            debug("视频加载中");
            
            video.play().then(() => {
              debug("普通视频播放成功");
              setVideoStatus('playing');
            }).catch(e => {
              error("普通视频播放失败", e);
              handleVideoError(e);
            });
          } catch (e) {
            error("设置普通视频源失败", e);
            handleVideoError(e);
          }
        }
        
        return () => {
          debug("移除视频错误监听器");
          video.removeEventListener('error', handleVideoError);
        };
      } catch (err) {
        error("视频整体加载流程出错", err);
        setVideoStatus('error');
        return () => {};
      }
    };
    
    // 立即播放视频
    const cleanup2 = playVideo();
    
    // 添加时间更新事件监听
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // 更新最后活动时间
      updateLastActiveTime();
    };
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    debug("已添加timeupdate事件监听器");
    
    // 清理函数
    return () => {
      debug("组件卸载或更新，执行清理");
      if (cleanup2) cleanup2();
      video.removeEventListener('timeupdate', handleTimeUpdate);
      cleanup();
    };
  }, [currentVideo]);

  // 监测全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement = 
        document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement || 
        document.msFullscreenElement;
      
      setIsFullscreen(!!fullscreenElement);
      
      // 更新字幕显示
      if (fullscreenElement && subtitleContent) {
        // 短暂延迟确保字幕显示在视频控制栏之上
        setTimeout(() => {
          // 全屏模式下使用外部字幕
          const externalSubtitle = document.getElementById('external-subtitle-overlay');
          if (externalSubtitle) {
            externalSubtitle.style.visibility = 'visible';
            externalSubtitle.style.opacity = '1';
            
            // 在Electron环境下的特殊处理
            if (window.navigator && window.navigator.userAgent.includes('Electron')) {
              document.body.appendChild(externalSubtitle);
            }
          }
        }, 300);
      } else {
        // 退出全屏时，恢复原始状态
        const externalSubtitle = document.getElementById('external-subtitle-overlay');
        if (externalSubtitle) {
          externalSubtitle.style.visibility = 'hidden';
          externalSubtitle.style.opacity = '0';
          
          // 如果之前被移到了body，恢复原位置
          if (externalSubtitle.parentElement === document.body) {
            const container = document.querySelector('.custom-video-container');
            if (container) {
              container.appendChild(externalSubtitle);
            }
          }
        }
      }
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [subtitleContent]);

  // 跳转到指定时间点
  const seekToTime = (seconds) => {
    if (!videoRef.current) {
      error("跳转失败：无视频元素");
      return;
    }
    
    try {
      debug(`请求跳转到 ${seconds} 秒`);
      const video = videoRef.current;
      
      // 记录视频当前状态
      debug("视频跳转前状态", {
        readyState: video.readyState,
        networkState: video.networkState,
        paused: video.paused,
        currentTime: video.currentTime,
        duration: video.duration,
        error: video.error
      });
      
      // 检查视频是否已加载并准备好
      if (video.readyState >= 2) {
        // 视频已经准备好，可以直接跳转
        try {
          video.currentTime = seconds;
          debug(`直接跳转到 ${seconds} 秒成功`);
          
          // 如果视频暂停中，尝试播放
          if (video.paused) {
            debug("视频暂停中，尝试播放");
            video.play().then(() => {
              debug("跳转后播放成功");
            }).catch(e => {
              error("跳转后播放失败", e);
            });
          }
        } catch (e) {
          error("直接跳转失败", e);
        }
      } else {
        // 视频未准备好，设置一个一次性事件监听器
        debug("视频未准备好，等待加载后跳转");
        
        const handleCanPlay = () => {
          // 移除事件监听以避免重复调用
          debug("canplay/loadedmetadata 事件触发，准备跳转");
          video.removeEventListener('canplay', handleCanPlay);
          video.removeEventListener('loadedmetadata', handleCanPlay);
          
          // 设置视频当前时间
          try {
            // 添加短暂延迟再跳转
            setTimeout(() => {
              try {
                video.currentTime = seconds;
                debug(`延迟后跳转到 ${seconds} 秒成功`);
                
                // 如果视频暂停中，尝试播放
                if (video.paused) {
                  debug("视频暂停中，尝试播放");
                  video.play().then(() => {
                    debug("跳转后播放成功");
                  }).catch(e => {
                    error("跳转后播放失败", e);
                  });
                }
              } catch (delayErr) {
                error("延迟跳转失败", delayErr);
              }
            }, 200);
          } catch (err) {
            error("跳转设置时间失败", err);
          }
        };
        
        // 添加两个事件处理，确保至少一个会被触发
        debug("添加canplay和loadedmetadata事件监听器");
        video.addEventListener('canplay', handleCanPlay, { once: true });
        video.addEventListener('loadedmetadata', handleCanPlay, { once: true });
        
        // 如果视频已经加载好元数据，马上触发
        if (video.readyState >= 1) {
          debug("视频元数据已加载，直接调用处理函数");
          handleCanPlay();
        }
      }
    } catch (e) {
      error("视频跳转整体流程错误", e);
    }
  };

  // 切换字幕列表显示
  const toggleSubtitleList = () => {
    setShowSubtitleList(!showSubtitleList);
  };
  
  // 切换字幕循环状态
  const toggleSubtitleLoop = () => {
    try {
      // 极简版本 - 只执行最基本的状态切换
      setIsLoopingSubtitle(current => !current);
    } catch (err) {
      console.error('[ERROR] 切换字幕循环状态失败:', err);
    }
  };
  
  // 切换到上一个字幕
  const goToPreviousSubtitle = () => {
    try {
      if (!parsedSubtitles || !Array.isArray(parsedSubtitles) || !parsedSubtitles.length || !videoRef.current) {
        console.warn('[WARN] 没有可用的字幕数据或视频元素');
        return;
      }
      
      // 安全检查 - 确保字幕数组结构正确
      const MAX_SUBTITLES = 10000; // 合理的最大值，防止无限循环
      if (parsedSubtitles.length > MAX_SUBTITLES) {
        console.warn('[WARN] 字幕数据异常大，可能有误', parsedSubtitles.length);
        return;
      }
      
      let targetIndex = currentSubtitleIndex - 1;
      
      // 如果当前没有活动字幕或者是第一个字幕，找到最近的字幕
      if (targetIndex < 0) {
        const currentMs = videoRef.current.currentTime * 1000;
        
        // 对于大型字幕数据，采用优化查找
        if (parsedSubtitles.length > 100) {
          // 从当前位置开始向前查找最近的字幕
          targetIndex = 0; // 默认使用第一个
          
          // 使用二分查找找到大致位置
          let low = 0;
          let high = parsedSubtitles.length - 1;
          let closestBeforeCurrent = -1;
          
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const subtitle = parsedSubtitles[mid];
            
            // 安全检查
            if (!subtitle || typeof subtitle.start !== 'number') {
              break;
            }
            
            if (subtitle.start < currentMs) {
              closestBeforeCurrent = mid;
              low = mid + 1;
            } else {
              high = mid - 1;
            }
          }
          
          // 如果找到了当前时间之前的字幕，使用它
          if (closestBeforeCurrent !== -1) {
            targetIndex = closestBeforeCurrent;
          }
        } 
        // 对于小型字幕数据，使用线性查找
        else {
          // 找到当前时间之前的最后一个字幕
          for (let i = parsedSubtitles.length - 1; i >= 0; i--) {
            const subtitle = parsedSubtitles[i];
            if (subtitle && typeof subtitle.start === 'number' && 
                subtitle.start < currentMs) {
              targetIndex = i;
              break;
            }
          }
        }
        
        // 如果仍然没有找到，使用第一个字幕
        if (targetIndex < 0 && parsedSubtitles.length > 0) {
          targetIndex = 0;
        }
      }
      
      // 如果找到了目标字幕，跳转到它的开始时间
      if (targetIndex >= 0 && targetIndex < parsedSubtitles.length && 
          parsedSubtitles[targetIndex] && typeof parsedSubtitles[targetIndex].start === 'number') {
        const targetTime = parsedSubtitles[targetIndex].start / 1000;
        
        // 安全检查 - 确保跳转时间有效
        if (!isNaN(targetTime) && targetTime >= 0 && targetTime < videoRef.current.duration) {
          console.log(`[DEBUG] 跳转到上一个字幕: #${targetIndex}, 时间: ${targetTime}秒`);
          seekToTime(targetTime);
        } else {
          console.warn(`[WARN] 字幕跳转时间无效: ${targetTime}`);
        }
      }
    } catch (err) {
      console.error('[ERROR] 切换到上一个字幕失败:', err);
    }
  };
  
  // 切换到下一个字幕
  const goToNextSubtitle = () => {
    try {
      if (!parsedSubtitles || !Array.isArray(parsedSubtitles) || !parsedSubtitles.length || !videoRef.current) {
        console.warn('[WARN] 没有可用的字幕数据或视频元素');
        return;
      }
      
      // 安全检查 - 确保字幕数组结构正确
      const MAX_SUBTITLES = 10000; // 合理的最大值，防止无限循环
      if (parsedSubtitles.length > MAX_SUBTITLES) {
        console.warn('[WARN] 字幕数据异常大，可能有误', parsedSubtitles.length);
        return;
      }
      
      let targetIndex = currentSubtitleIndex + 1;
      
      // 如果是最后一个字幕或者没有活动字幕，寻找下一个合适的字幕
      if (targetIndex >= parsedSubtitles.length || targetIndex < 0) {
        const currentMs = videoRef.current.currentTime * 1000;
        
        // 对于大型字幕数据，采用优化查找
        if (parsedSubtitles.length > 100) {
          // 默认使用第一个字幕
          targetIndex = 0;
          
          // 使用二分查找找到大致位置
          let low = 0;
          let high = parsedSubtitles.length - 1;
          let closestAfterCurrent = -1;
          
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const subtitle = parsedSubtitles[mid];
            
            // 安全检查
            if (!subtitle || typeof subtitle.start !== 'number') {
              break;
            }
            
            if (subtitle.start > currentMs) {
              closestAfterCurrent = mid;
              high = mid - 1;
            } else {
              low = mid + 1;
            }
          }
          
          // 如果找到了当前时间之后的字幕，使用它
          if (closestAfterCurrent !== -1) {
            targetIndex = closestAfterCurrent;
          }
        }
        // 对于小型字幕数据，使用线性查找
        else {
          // 找到当前时间之后的第一个字幕
          for (let i = 0; i < parsedSubtitles.length; i++) {
            const subtitle = parsedSubtitles[i];
            if (subtitle && typeof subtitle.start === 'number' && 
                subtitle.start > currentMs) {
              targetIndex = i;
              break;
            }
          }
        }
        
        // 如果没有找到，回到第一个字幕
        if (targetIndex >= parsedSubtitles.length) {
          targetIndex = 0;
        }
      }
      
      // 跳转到目标字幕的开始时间
      if (targetIndex >= 0 && targetIndex < parsedSubtitles.length && 
          parsedSubtitles[targetIndex] && typeof parsedSubtitles[targetIndex].start === 'number') {
        const targetTime = parsedSubtitles[targetIndex].start / 1000;
        
        // 安全检查 - 确保跳转时间有效
        if (!isNaN(targetTime) && targetTime >= 0 && targetTime < videoRef.current.duration) {
          console.log(`[DEBUG] 跳转到下一个字幕: #${targetIndex}, 时间: ${targetTime}秒`);
          seekToTime(targetTime);
        } else {
          console.warn(`[WARN] 字幕跳转时间无效: ${targetTime}`);
        }
      }
    } catch (err) {
      console.error('[ERROR] 切换到下一个字幕失败:', err);
    }
  };
  
  // 切换播放/暂停状态
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play()
        .then(() => setIsPaused(false))
        .catch(e => console.error("播放失败:", e));
    } else {
      video.pause();
      setIsPaused(true);
    }
  };
  
  // 更新暂停状态
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handlePause = () => setIsPaused(true);
    const handlePlay = () => {
      setIsPaused(false);
      updateLastActiveTime();
    };
    
    video.addEventListener('pause', handlePause);
    video.addEventListener('play', handlePlay);
    
    return () => {
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('play', handlePlay);
    };
  }, []);

  // 重置视频播放器
  const resetPlayer = () => {
    debug("手动重置播放器");
    
    // 如果当前有视频，先清理
    const video = videoRef.current;
    if (video) {
      video.pause();
      
      if (hlsRef.current) {
        debug("销毁现有HLS实例");
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      // 移除src属性并重置
      try {
        video.removeAttribute('src');
        video.load();
        debug("已重置视频元素");
      } catch (e) {
        error("重置视频元素失败", e);
      }
      
      // 重置状态
      setVideoStatus('idle');
      
      // 短暂延迟后重新加载
      setTimeout(() => {
        if (currentVideo) {
          debug("尝试重新加载视频");
          // 通过更新DOM元素进行强制重建
          const videoContainer = video.parentElement;
          if (videoContainer) {
            const oldVideo = video;
            const newVideo = oldVideo.cloneNode(false);
            videoContainer.replaceChild(newVideo, oldVideo);
            videoRef.current = newVideo;
            debug("已替换视频元素");
          }
          
          // 设为加载状态
          setVideoStatus('loading');
        }
      }, 300);
    }
  };
  
  // 将关键函数暴露到全局供调试
  useEffect(() => {
    // 仅在开发环境或明确启用调试时才创建调试API
    if ((process.env.NODE_ENV === 'development' || localStorage.getItem('enablePlayerDebug') === 'true') && typeof window !== 'undefined') {
      window.__debugPlayerApi = {
        resetPlayer,
        seekToTime,
        getVideoElement: () => videoRef.current,
        getHlsInstance: () => hlsRef.current,
        forcePlay: () => {
          if (videoRef.current) {
            videoRef.current.play().catch(e => error("强制播放失败", e));
            updateLastActiveTime();
          }
        },
        setState: (state) => {
          setVideoStatus(state);
        },
        enableAutoResume: () => {
          localStorage.setItem('enablePlayerDebug', 'true');
          return "已启用视频自动恢复和调试";
        },
        disableAutoResume: () => {
          localStorage.removeItem('enablePlayerDebug');
          return "已禁用视频自动恢复和调试";
        }
      };
      
      // debug("已暴露调试API到window.__debugPlayerApi");
    }
    
    return () => {
      if (typeof window !== 'undefined' && window.__debugPlayerApi) {
        window.__debugPlayerApi = null;
      }
    };
  }, [resetPlayer, seekToTime]);

  // 手动请求全屏显示
  const requestFullscreen = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    
    try {
      if (videoElement.requestFullscreen) {
        videoElement.requestFullscreen();
      } else if (videoElement.webkitRequestFullscreen) {
        videoElement.webkitRequestFullscreen();
      } else if (videoElement.msRequestFullscreen) {
        videoElement.msRequestFullscreen();
      } else if (videoElement.mozRequestFullScreen) {
        videoElement.mozRequestFullScreen();
      }
    } catch (e) {
      console.error("全屏请求失败:", e);
    }
  };

  // 添加视频元素的触摸事件，防止浏览器或系统自动暂停视频
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentVideo) return;

    // 每20秒轻触一下视频元素，防止系统认为媒体播放器处于不活动状态
    const touchInterval = setInterval(() => {
      if (video && !video.paused && video.readyState >= 3) {
        // 通过触发轻微的音量变化来保持媒体活动
        const currentVolume = video.volume;
        // 保存当前音量，小幅调整后恢复，几乎不会被察觉
        if (currentVolume > 0.01) {
          video.volume = Math.max(0.01, currentVolume - 0.01);
          setTimeout(() => {
            if (video) video.volume = currentVolume;
          }, 100);
        }
        
        // 通过触发一个自定义事件来保持活动状态
        video.dispatchEvent(new Event('keep-alive'));
        updateLastActiveTime();
      }
    }, 20000);
    
    return () => {
      clearInterval(touchInterval);
    };
  }, [currentVideo]);
  
  // 防止页面可见性变化时视频意外停止
  useEffect(() => {
    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (!video) return;
      
      // 当页面重新变为可见且视频应该在播放状态时，确保它在播放
      if (document.visibilityState === 'visible' && !isPaused && video.paused) {
        debug("页面重新可见，检查视频播放状态");
        setTimeout(() => {
          if (video && video.paused && !isPaused) {
            video.play()
              .then(() => debug("页面可见性变化后恢复播放"))
              .catch(e => error("页面可见性变化后恢复播放失败", e));
          }
        }, 500);
      }
      
      updateLastActiveTime();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPaused]);

  // 添加全局错误处理器来捕获未处理的异常
  useEffect(() => {
    const handleGlobalError = (event) => {
      event.preventDefault();
      console.error('[GLOBAL ERROR] 未捕获的错误:', {
        message: event.error?.message || '未知错误',
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: new Date().toISOString(),
        source: 'window.onerror'
      });
    };
    
    const handlePromiseRejection = (event) => {
      event.preventDefault();
      console.error('[GLOBAL ERROR] 未处理的Promise拒绝:', {
        message: event.reason?.message || '未知原因',
        stack: event.reason?.stack,
        timestamp: new Date().toISOString(),
        source: 'unhandledrejection'
      });
    };
    
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handlePromiseRejection);
    
    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handlePromiseRejection);
    };
  }, []);

  return (
    <div className="flex-1 bg-white rounded-lg shadow-sm p-3 flex flex-col min-h-0">
      {currentVideo ? (
        <>
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h2 className="text-base font-semibold truncate flex-1">
            {currentVideo.name}
              {currentSubtitle && (
                <span className="ml-2 text-xs text-yellow-600">
                  (字幕: {currentSubtitle.name})
                </span>
              )}
          </h2>
            
            {currentSubtitle && (
              <button 
                className="btn btn-xs btn-ghost"
                onClick={toggleSubtitleList}
              >
                {showSubtitleList ? '隐藏字幕列表' : '显示字幕列表'}
              </button>
            )}
          </div>
          
          <div className="flex flex-1 gap-2 min-h-0 overflow-hidden">
            {/* 视频播放区 */}
            <div className={`relative flex-1 ${showSubtitleList && currentSubtitle ? 'w-7/12' : 'w-full'}`}>
              {/* 字幕提示消息 */}
              {showSubtitleTip && (
                <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg z-30 text-sm text-center whitespace-nowrap">
                  提示: 字幕可以拖动！点击并拖拽字幕可以调整位置，双击可以重置位置
                </div>
              )}
              
              {videoStatus === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-white z-10">
                  <div className="text-center">
                    <div className="text-xl mb-2">视频加载失败</div>
                    <div className="text-sm text-gray-300">请尝试其他视频或刷新页面</div>
                    <button 
                      className="mt-4 btn btn-sm btn-outline btn-warning"
                      onClick={() => window.location.reload()}
                    >
                      刷新页面
                    </button>
                  </div>
                </div>
              )}
              
              {/* 视频控制面板 */}
              <div className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 text-white text-xs z-20 rounded-md flex items-center">
                {/* 字幕控制按钮 - 只在有有效字幕内容时显示 */}
                {console.log('[DEBUG] 字幕控制条件检查:', {
                  hasSubtitleContent: !!subtitleContent,
                  hasParsedSubtitles: !!parsedSubtitles,
                  isArray: Array.isArray(parsedSubtitles),
                  subtitlesLength: parsedSubtitles?.length || 0
                })}
                {subtitleContent && (
                  <>
                    <div className="flex items-center mr-3">
                      {/* 替换标准checkbox为简单按钮，避免复杂事件处理 */}
                      <button 
                        className={`subtitle-loop-btn px-2 py-1 rounded text-xs ${isLoopingSubtitle ? 'bg-yellow-500' : 'bg-gray-700'}`}
                        onClick={() => {
                          try {
                            console.log('[DEBUG] 循环按钮点击事件触发');
                            // 使用简单的状态切换而不是调用复杂函数
                            setIsLoopingSubtitle(!isLoopingSubtitle);
                          } catch (err) {
                            console.error('[ERROR] 循环按钮事件处理失败:', err);
                          }
                        }}
                        title="字幕循环播放"
                      >
                        循环: {isLoopingSubtitle ? '开' : '关'}
                      </button>
                    </div>
                    
                    <div className="subtitle-controls flex items-center space-x-2 mr-3">
                      <button
                        onClick={goToPreviousSubtitle}
                        title="上一句字幕"
                      >
                        ⏮
                      </button>
                      
                      <button
                        onClick={togglePlayPause}
                        title={isPaused ? "播放" : "暂停"}
                      >
                        {isPaused ? "▶" : "⏸"}
                      </button>
                      
                      <button
                        onClick={goToNextSubtitle}
                        title="下一句字幕"
                      >
                        ⏭
                      </button>
                    </div>
                    
                    {/* 当前字幕指示器 */}
                    <div className="subtitle-indicator mr-3 px-2 py-0.5 bg-gray-700 rounded text-xs">
                      字幕: {currentSubtitleIndex >= 0 ? currentSubtitleIndex + 1 : "-"}/
                      {parsedSubtitles && Array.isArray(parsedSubtitles) ? parsedSubtitles.length : 0}
                    </div>
                  </>
                )}
                
                {/* 视频控制按钮 */}
                <button
                  className="ml-1 px-1 bg-red-500 rounded hover:bg-red-600"
                  onClick={resetPlayer}
                  title="重置视频"
                >
                  重置
                </button>
                
                <button
                  className="ml-1 px-1 bg-blue-500 rounded hover:bg-blue-600"
                  onClick={requestFullscreen}
                  title="全屏播放"
                >
                  全屏
                </button>
                
                {subtitleContent && (
                  <button
                    className="ml-1 px-1 bg-yellow-500 rounded hover:bg-yellow-600"
                    title="字幕可以拖动！点击并拖拽字幕可以调整位置，双击可以重置位置"
                  >
                    字幕提示
                  </button>
                )}
              </div>
            
              <div className="video-container relative">
                {/* 视频加载中显示加载指示器 */}
                {videoStatus === 'loading' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-5">
                    <div className="text-white">
                      <svg className="animate-spin h-8 w-8 mr-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  </div>
                )}
                
                {/* 内嵌字幕直接覆盖在视频上 */}
                <div className="custom-video-container relative w-full h-full" style={{ overflow: 'hidden' }}>
                  <div className="video-wrapper relative w-full h-full">
            <video 
              ref={videoRef}
                      className="w-full h-full rounded bg-gray-900 object-contain"
              controls
              autoPlay
              playsInline
                      style={{
                        minHeight: '300px',
                        border: '1px solid #333',
                        display: 'block'
                      }}
                    />
                    
                    {/* 视频内嵌字幕层 - 绝对定位在视频上方 */}
                    {subtitleContent && currentTime > 0 && !isFullscreen && (
                      <div className="inner-subtitle-overlay">
                        <SubtitleDisplay 
                          subtitleContent={subtitleContent}
                          currentTime={currentTime}
                          isFullscreen={false}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* 视频外部字幕层 - 作为备用，当全屏时内嵌字幕可能无法显示 */}
                  {subtitleContent && currentTime > 0 && (
                    <div 
                      id="external-subtitle-overlay"
                      className="external-subtitle-overlay" 
                      style={{
                        opacity: isFullscreen ? 1 : 0,
                        visibility: isFullscreen ? 'visible' : 'hidden'
                      }}
                    >
                      <SubtitleDisplay 
                        subtitleContent={subtitleContent}
                        currentTime={currentTime}
                        isFullscreen={true}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* 字幕列表区 - 固定高度，独立滚动 */}
            {showSubtitleList && currentSubtitle && (
              <div className="w-5/12 min-w-[280px] max-w-[400px] subtitle-container border border-gray-200 rounded">
                <div className="subtitle-list-header bg-gray-100 px-3 py-2 border-b border-gray-200 text-sm font-medium flex items-center justify-between">
                  <span>字幕列表</span>
                  <span className="text-xs text-gray-500">(点击跳转)</span>
                </div>
                <div className="subtitle-list-body bg-gray-50">
                  <SubtitleList 
                    subtitleContent={subtitleContent}
                    currentTime={currentTime}
                    onSubtitleClick={seekToTime}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          请点击视频文件进行播放
        </div>
      )}
    </div>
  );
}

export default PlayerPanel; 