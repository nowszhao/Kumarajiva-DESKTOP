import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

// 默认禁用冗长日志
if (localStorage.getItem('disableVerbosePlayerLogs') === null) {
  localStorage.setItem('disableVerbosePlayerLogs', 'true');
}

// Debug utilities
const debug = (message, data) => {
  if ((process.env.NODE_ENV === 'development' || localStorage.getItem('enablePlayerDebug') === 'true') && 
      localStorage.getItem('disableVerbosePlayerLogs') !== 'true') {
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(`[${timestamp}] 🎬 ${message}`, data || '');
  }
};

const error = (message, err) => {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.error(`[${timestamp}] ❌ ${message}`, err || '');
};

// Check if running in Electron
const isElectron = () => {
  return window.navigator && window.navigator.userAgent.includes('Electron');
};

const VideoPlayer = ({ 
  currentVideo, 
  onTimeUpdate, 
  onPlayerReady, 
  onError, 
  onStatusChange,
  videoRef,
  isFullscreen
}) => {
  const hlsRef = useRef(null);
  const [videoStatus, setVideoStatus] = useState('idle'); // idle, loading, playing, error
  const lastActiveTimeRef = useRef(Date.now());
  const autoResumeRef = useRef(null);
  const videoWatchdogRef = useRef(null);
  const forcePlayTimerRef = useRef(null);
  const lastPlayedTimeRef = useRef(0);
  const playAttemptCountRef = useRef(0);
  const videoUrlRef = useRef(null);
  const setupCompleteRef = useRef(false);

  // Update last active time
  const updateLastActiveTime = () => {
    lastActiveTimeRef.current = Date.now();
  };

  // Initialize video watchdog system
  useEffect(() => {
    debug("Initializing video watchdog system");
    
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

  // Create a stable cleanup function that won't change between renders
  const createCleanupFunction = useCallback(() => {
    debug('Executing cleanup', { hasHls: !!hlsRef.current });
    
    if (hlsRef.current) {
      debug("Destroying HLS instance");
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    if (videoRef.current) {
      debug("Cleaning up video element", { src: videoRef.current.src ? 'has src' : 'no src' });
      videoRef.current.pause();
      
      try {
        videoRef.current.removeAttribute('src');
        debug("Video src attribute removed");
      } catch (e) {
        error("Error removing src attribute", e);
      }
      
      try {
        videoRef.current.load();
        debug("Video load state reset");
      } catch (e) {
        error("Error resetting video load", e);
      }
      
      setVideoStatus('idle');
      onStatusChange && onStatusChange('idle');
    }
    
    setupCompleteRef.current = false;
  }, [onStatusChange]);

  // Setup video player
  useEffect(() => {
    // Skip if we already have this video url loaded
    if (videoUrlRef.current === currentVideo?.url && setupCompleteRef.current) {
      debug('Same video URL already loaded, skipping setup', currentVideo?.url?.substring(0, 50) + '...');
      return;
    }
    
    if (currentVideo?.url) {
      videoUrlRef.current = currentVideo.url;
    }
    
    // Add detailed debug logging for video loading
    if (process.env.NODE_ENV === 'development' && localStorage.getItem('enableDetailedPlayerDebug') === 'true') {
      console.log('==================== VIDEO PLAYER DEBUG ====================');
      console.log('Video component received props:', { 
        hasCurrentVideo: !!currentVideo,
        videoName: currentVideo?.name,
        videoUrl: currentVideo?.url ? (currentVideo.url.substring(0, 100) + '...') : 'none',
        isHls: currentVideo?.url?.includes('.m3u8')
      });
      
      if (currentVideo?.url) {
        console.log('Video URL headers:', currentVideo.url.substring(0, 200));
      } else {
        console.error('No video URL provided!');
        setVideoStatus('error');
        onStatusChange && onStatusChange('error');
        onError && onError(new Error('No video URL provided'));
        return;
      }
      
      console.log('Video DOM element exists:', !!videoRef.current);
      console.log('=============================================================');
    }
    
    debug('Video component mounted or updated', { currentVideo: currentVideo?.name });
    const video = videoRef.current;
    
    if (!video) {
      error('Video DOM element does not exist');
      setVideoStatus('error');
      onStatusChange && onStatusChange('error');
      onError && onError(new Error('Video DOM element does not exist'));
      return;
    }
    
    // Direct check for video URL - fail early if missing
    if (!currentVideo || !currentVideo.url) {
      error('Missing video URL, cannot play video');
      setVideoStatus('error');
      onStatusChange && onStatusChange('error');
      onError && onError(new Error('Missing video URL'));
      return;
    }
    
    // Clean up previous instances
    createCleanupFunction();
    
    // Update status
    setVideoStatus('loading');
    onStatusChange && onStatusChange('loading');
    
    // Apply Electron-specific fixes
    const applyElectronHacks = () => {
      debug("Applying Electron video compatibility fixes");
      
      if (video.style) {
        video.style.transform = 'translateZ(0)';
        video.style.backfaceVisibility = 'hidden';
        
        if (navigator.platform.indexOf('Mac') > -1) {
          debug("Detected macOS, applying special fixes");
          
          const triggerResize = () => {
            window.dispatchEvent(new Event('resize'));
          };
          
          const redrawVideo = () => {
            const originalDisplay = video.style.display;
            video.style.display = 'none';
            
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
    
    applyElectronHacks();
    
    // Setup video event listeners
    const setupVideoListeners = () => {
      const videoEvents = [
        'loadstart', 'durationchange', 'loadedmetadata', 'loadeddata', 'progress', 
        'canplay', 'canplaythrough', 'playing', 'waiting', 'stalled'
      ];
      
      // 创建命名事件处理函数
      const eventHandlers = {};
      
      // 移除旧的事件监听器
      videoEvents.forEach(eventName => {
        if (eventHandlers[eventName]) {
          video.removeEventListener(eventName, eventHandlers[eventName]);
        }
      });
      
      // 创建新的、唯一的事件处理函数
      videoEvents.forEach(eventName => {
        eventHandlers[eventName] = () => {
          // debug(`Video event: ${eventName}`, { 
          //   readyState: video.readyState,
          //   networkState: video.networkState,
          //   duration: video.duration,
          //   currentSrc: video.currentSrc && video.currentSrc.slice(0, 100) + '...',
          //   videoWidth: video.videoWidth,
          //   videoHeight: video.videoHeight
          // });
          
          if (eventName === 'canplay' || eventName === 'canplaythrough' || eventName === 'playing') {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              debug("Video dimensions valid, updating status to playing");
              setVideoStatus('playing');
              onStatusChange && onStatusChange('playing');
            }
          }
        };
        
        // 添加新的事件监听器
        video.addEventListener(eventName, eventHandlers[eventName]);
      });
      
      // 错误事件处理函数
      const errorHandler = (e) => {
        const errorCodes = {
          1: 'MEDIA_ERR_ABORTED',
          2: 'MEDIA_ERR_NETWORK',
          3: 'MEDIA_ERR_DECODE',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
        };
        
        const videoError = video.error;
        error('Video error event', { 
          code: videoError ? errorCodes[videoError.code] || videoError.code : 'unknown',
          message: videoError ? videoError.message : 'No error details',
          event: e
        });
        setVideoStatus('error');
        onStatusChange && onStatusChange('error');
        onError && onError(videoError || new Error('Unknown video error'));
      };
      
      // 添加错误事件监听器
      video.addEventListener('error', errorHandler);
      
      // 时间更新事件处理函数
      const handleTimeUpdate = () => {
        onTimeUpdate && onTimeUpdate(video.currentTime);
        updateLastActiveTime();
      };
      
      video.addEventListener('timeupdate', handleTimeUpdate);
      
      // 返回清理函数
      return () => {
        // 移除所有注册的事件监听器
        videoEvents.forEach(eventName => {
          if (eventHandlers[eventName]) {
            video.removeEventListener(eventName, eventHandlers[eventName]);
          }
        });
        
        video.removeEventListener('error', errorHandler);
        video.removeEventListener('timeupdate', handleTimeUpdate);
      };
    };
    
    const timeUpdateCleanup = setupVideoListeners();
    debug('Video event listeners set up');
    
    // Play new video with a slight delay to let the DOM update
    setTimeout(() => {
      // Play new video
      const playVideo = () => {
        debug("Starting to load new video", { url: currentVideo.url.substring(0, 100) + '...' });
        
        try {
          debug("Current video element status", { 
            readyState: video.readyState,
            networkState: video.networkState,
            paused: video.paused
          });
          
          // Set error handling
          const handleVideoError = (e) => {
            error("Video loading error", e);
            setVideoStatus('error');
            onStatusChange && onStatusChange('error');
            onError && onError(e);
            
            if (videoRef.current) {
              debug("Setting error placeholder image");
              videoRef.current.poster = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif' font-size='14px' fill='%23fff'%3E视频加载失败%3C/text%3E%3C/svg%3E";
            }
          };
          
          video.addEventListener('error', handleVideoError);
          
          // Choose appropriate playback method based on URL type
          if (currentVideo.url.includes('.m3u8')) {
            debug("HLS format video detected");
            
            // Use HLS.js for m3u8 playback
            if (Hls.isSupported()) {
              debug("Using HLS.js for playback");
              
              // Skip if we've already created an HLS instance for this URL
              if (hlsRef.current) {
                debug("Destroying existing HLS instance before creating a new one");
                hlsRef.current.destroy();
                hlsRef.current = null;
              }
              
              const hls = new Hls({
                debug: false,
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
                fragLoadingMaxRetry: 8,
                manifestLoadingMaxRetry: 8,
                levelLoadingMaxRetry: 8,
                fragLoadingRetryDelay: 1000,
                manifestLoadingRetryDelay: 1000,
                levelLoadingRetryDelay: 1000,
                startLevel: -1,
                abrEwmaDefaultEstimate: 500000,
                abrBandWidthFactor: 0.8,
                abrBandWidthUpFactor: 0.7,
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 10,
                enableWorker: true,
                disableVideoTagFallback: false,
                lowLatencyMode: false,
                backBufferLength: 60,
                progressive: true,
                testBandwidth: true,
                enableSoftwareAES: true,
                capLevelToPlayerSize: true,
                maxLevelCappingMode: 'downscale'
              });
              hlsRef.current = hls;
              
              hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                debug("HLS: Media attached");
              });
              
              hls.on(Hls.Events.MANIFEST_LOADING, () => {
                debug("HLS: Loading manifest");
              });
              
              hls.on(Hls.Events.MANIFEST_LOADED, () => {
                debug("HLS: Manifest loaded");
              });
              
              hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                debug("HLS: Manifest parsed", data);
                debug("Attempting to play video");
                
                // Use a slight delay before playing to allow everything to stabilize
                setTimeout(() => {
                  if (!videoRef.current) return;
                  
                  videoRef.current.play().then(() => {
                    debug("Video playback started");
                    setVideoStatus('playing');
                    onStatusChange && onStatusChange('playing');
                    onPlayerReady && onPlayerReady();
                    
                    // Mark setup as complete
                    setupCompleteRef.current = true;
                  }).catch(e => {
                    error("Playback failed", e);
                    
                    debug("Trying muted playback");
                    videoRef.current.muted = true;
                    
                    videoRef.current.play().then(() => {
                      debug("Muted playback successful");
                      setVideoStatus('playing');
                      onStatusChange && onStatusChange('playing');
                      onPlayerReady && onPlayerReady();
                      
                      // Mark setup as complete
                      setupCompleteRef.current = true;
                    }).catch(e2 => {
                      error("Muted playback also failed", e2);
                      handleVideoError(e2);
                    });
                  });
                }, 500);
              });
              
              hls.on(Hls.Events.FRAG_LOADING, () => {
                debug("HLS: Loading fragment");
              });
              
              hls.on(Hls.Events.FRAG_LOADED, () => {
                debug("HLS: Fragment loaded");
              });
              
              hls.on(Hls.Events.ERROR, (event, data) => {
                error("HLS error", data);
                
                if (data.fatal) {
                  switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      debug("Network error, attempting recovery");
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      debug("Media error, attempting recovery");
                      hls.recoverMediaError();
                      break;
                    default:
                      error("Unrecoverable error, cleaning up instance");
                      
                      // Try fallback method
                      if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        debug("Attempting fallback to native player");
                        try {
                          video.src = currentVideo.url;
                          video.play().catch(e => {
                            error("Fallback playback also failed", e);
                            createCleanupFunction();
                            handleVideoError(new Error("Cannot play video: " + data.details));
                          });
                          return;
                        } catch (e) {
                          error("Fallback playback failed", e);
                        }
                      }
                      
                      createCleanupFunction();
                      handleVideoError(new Error("Cannot play video: " + data.details));
                      break;
                  }
                } else {
                  debug("Non-fatal HLS error, continuing playback", data.details);
                }
              });
              
              debug("Preparing to load HLS source", { url: currentVideo.url.substring(0, 100) + '...' });
              
              try {
                hls.loadSource(currentVideo.url);
                debug("HLS source load request sent");
                
                hls.attachMedia(video);
                debug("HLS bound to video element");
              } catch (e) {
                error("HLS loading or binding failed", e);
                handleVideoError(e);
              }
            } 
            // Native HLS support (Safari)
            else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              debug("Using browser's native HLS support");
              
              try {
                video.src = currentVideo.url;
                debug("Video source set");
                
                setTimeout(() => {
                  if (!videoRef.current) return;
                  
                  videoRef.current.play().then(() => {
                    debug("Native HLS playback successful");
                    setVideoStatus('playing');
                    onStatusChange && onStatusChange('playing');
                    onPlayerReady && onPlayerReady();
                    
                    // Mark setup as complete
                    setupCompleteRef.current = true;
                  }).catch(e => {
                    error("Native playback failed", e);
                    handleVideoError(e);
                  });
                }, 300);
              } catch (e) {
                error("Setting native HLS source failed", e);
                handleVideoError(e);
              }
            } 
            // No HLS support
            else {
              error("This browser doesn't support HLS");
              handleVideoError(new Error("Browser doesn't support HLS"));
            }
          } 
          // Regular video
          else {
            debug("Loading regular video");
            
            try {
              video.src = currentVideo.url;
              debug("Regular video source set");
              
              video.load();
              debug("Video loading");
              
              setTimeout(() => {
                if (!videoRef.current) return;
                
                videoRef.current.play().then(() => {
                  debug("Regular video playback successful");
                  setVideoStatus('playing');
                  onStatusChange && onStatusChange('playing');
                  onPlayerReady && onPlayerReady();
                  
                  // Mark setup as complete
                  setupCompleteRef.current = true;
                }).catch(e => {
                  error("Regular video playback failed", e);
                  handleVideoError(e);
                });
              }, 300);
            } catch (e) {
              error("Setting regular video source failed", e);
              handleVideoError(e);
            }
          }
          
          return () => {
            debug("Removing video error listener");
            video.removeEventListener('error', handleVideoError);
          };
        } catch (err) {
          error("Error in overall video loading process", err);
          setVideoStatus('error');
          onStatusChange && onStatusChange('error');
          onError && onError(err);
          return () => {};
        }
      };
      
      // Play video immediately
      const videoErrorCleanup = playVideo();
      
      // Touch video element every 20 seconds to prevent auto-pause
      const touchInterval = setInterval(() => {
        if (video && !video.paused && video.readyState >= 3) {
          const currentVolume = video.volume;
          if (currentVolume > 0.01) {
            video.volume = Math.max(0.01, currentVolume - 0.01);
            setTimeout(() => {
              if (video) video.volume = currentVolume;
            }, 100);
          }
          
          video.dispatchEvent(new Event('keep-alive'));
          updateLastActiveTime();
        }
      }, 20000);
      
      // Update cleanup function to include the specific cleanups for this instance
      return () => {
        clearInterval(touchInterval);
        if (videoErrorCleanup) videoErrorCleanup();
      };
    }, 100); // Adding a small delay before setting up the video
    
    return () => {
      // Only clean up when the component is unmounting or changing videos
      if (videoUrlRef.current !== currentVideo?.url) {
        createCleanupFunction();
      }
    };
  }, [currentVideo, onTimeUpdate, onPlayerReady, onError, onStatusChange, createCleanupFunction]);

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (!video) return;
      
      if (document.visibilityState === 'visible' && !video.paused && video.paused) {
        debug("Page visible again, checking video playback state");
        setTimeout(() => {
          if (video && video.paused && !video.paused) {
            video.play()
              .then(() => debug("Resumed playback after visibility change"))
              .catch(e => error("Failed to resume playback after visibility change", e));
          }
        }, 500);
      }
      
      updateLastActiveTime();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null; // This is a logic-only component, no UI
};

export default VideoPlayer; 