import { useEffect, useRef, useState } from 'react';
import VideoPlayer from './VideoPlayer';
import SubtitleController from './SubtitleController';
import SubtitleLoop from './SubtitleLoop';
import PlayerControls from './PlayerControls';
import SubtitleDisplay from '../SubtitleDisplay';
import AdvancedPanel from '../AdvancedPanel';
import ntMp3 from '../../assets/nt.mp3';
import './player.css';
import '../../styles/subtitle.css';

// Check if running in Electron
const isElectron = () => {
  return window.navigator && window.navigator.userAgent.includes('Electron');
};

function PlayerPanel({ currentVideo, currentSubtitle, subtitleContent, onUpdatePlayProgress }) {
  const videoRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [showSubtitleList, setShowSubtitleList] = useState(true);
  const [videoStatus, setVideoStatus] = useState('idle'); // idle, loading, playing, error
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSubtitleTip, setShowSubtitleTip] = useState(false);
  const [isLoopingSubtitle, setIsLoopingSubtitle] = useState(false);
  const [subtitleLoopCount, setSubtitleLoopCount] = useState(0);
  const [currentLoopingSubtitleIndex, setCurrentLoopingSubtitleIndex] = useState(-1);
  const [parsedSubtitles, setParsedSubtitles] = useState([]);
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
  const [isPaused, setIsPaused] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showKeyboardShortcutTip, setShowKeyboardShortcutTip] = useState(false);
  // Subtitle blur state - using explicit boolean default
  const [isSubtitleBlurred, setIsSubtitleBlurred] = useState(() => {
    try {
      // Get saved setting from localStorage, convert string to boolean
      const savedValue = localStorage.getItem('subtitle-blur-enabled');
      // Only return true when value is string "true", otherwise false
      return savedValue === 'true';
    } catch (e) {
      console.error('[ERROR] Failed to read subtitle blur setting:', e);
      return false;
    }
  });
  const audioRef = useRef(null);
  const progressUpdateTimerRef = useRef(null);

  // Load component settings from localStorage on mount
  useEffect(() => {
    try {
      const savedLoopState = localStorage.getItem('subtitle-loop-enabled');
      if (savedLoopState === 'true') {
        setIsLoopingSubtitle(true);
        console.log('[INFO] Restored subtitle loop state from storage: enabled');
      }
      
      const savedBlurState = localStorage.getItem('subtitle-blur-enabled');
      if (savedBlurState === 'true') {
        setIsSubtitleBlurred(true);
        console.log('[INFO] Restored subtitle blur state from storage: enabled');
      }
    } catch (e) {
      console.error('[ERROR] Failed to read subtitle settings:', e);
    }
  }, []);

  // Handle video duration update
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
      
      // If video has initial play cursor, seek to it
      if (currentVideo && currentVideo.play_cursor) {
        try {
          const seekTime = parseFloat(currentVideo.play_cursor);
          if (!isNaN(seekTime) && seekTime > 0) {
            // 如果播放进度接近视频结尾 (小于30秒)，则从头播放
            if (seekTime < videoRef.current.duration - 30) {
              console.log(`Seeking to saved position: ${seekTime}s`);
              videoRef.current.currentTime = seekTime;
            } else {
              console.log(`Saved position too close to end (${seekTime}s), starting from beginning`);
            }
          }
        } catch (e) {
          console.error('Failed to seek to saved position:', e);
        }
      }
    }
  };

  // Save play progress periodically
  useEffect(() => {
    // Clear the timer when component unmounts or video changes
    const clearProgressTimer = () => {
      if (progressUpdateTimerRef.current) {
        clearInterval(progressUpdateTimerRef.current);
        progressUpdateTimerRef.current = null;
      }
    };
    
    // Start timer when we have a video playing
    if (currentVideo && videoRef.current && onUpdatePlayProgress && !isPaused) {
      clearProgressTimer(); // Clear any existing timer
      
      // Update progress every 10 seconds
      progressUpdateTimerRef.current = setInterval(() => {
        const currentTimeValue = videoRef.current?.currentTime;
        const durationValue = videoRef.current?.duration;
        
        if (currentTimeValue && durationValue && currentVideo.fileId) {
          onUpdatePlayProgress(currentVideo.fileId, currentTimeValue, durationValue);
        }
      }, 10000); // 10 seconds interval
      
      console.log('Started play progress tracking');
    } else {
      clearProgressTimer();
    }
    
    return clearProgressTimer;
  }, [currentVideo, isPaused, onUpdatePlayProgress]);

  // Save progress when video stops playing
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && currentVideo && videoRef.current) {
        // Save progress when user leaves the page
        onUpdatePlayProgress?.(
          currentVideo.fileId, 
          videoRef.current.currentTime, 
          videoRef.current.duration
        );
      }
    };
    
    // Save progress when video unloads or component unmounts
    const saveProgressOnUnload = () => {
      if (currentVideo && videoRef.current) {
        onUpdatePlayProgress?.(
          currentVideo.fileId, 
          videoRef.current.currentTime, 
          videoRef.current.duration
        );
      }
    };
    
    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', saveProgressOnUnload);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', saveProgressOnUnload);
      
      // Also save progress when component unmounts
      saveProgressOnUnload();
    };
  }, [currentVideo, onUpdatePlayProgress]);

  // Show subtitle tip
  useEffect(() => {
    if (subtitleContent && !localStorage.getItem('subtitle-tip-shown')) {
      setShowSubtitleTip(true);
      
      // Auto-close tip after 8 seconds
      const timer = setTimeout(() => {
        setShowSubtitleTip(false);
        localStorage.setItem('subtitle-tip-shown', 'true');
      }, 8000);
      
      return () => clearTimeout(timer);
    }
  }, [subtitleContent]);

  // Show keyboard shortcut tip
  useEffect(() => {
    if (currentVideo && !localStorage.getItem('keyboard-shortcut-tip-shown')) {
      setShowKeyboardShortcutTip(true);
      
      // Auto-close tip after 8 seconds
      const timer = setTimeout(() => {
        setShowKeyboardShortcutTip(false);
        localStorage.setItem('keyboard-shortcut-tip-shown', 'true');
      }, 8000);
      
      return () => clearTimeout(timer);
    }
  }, [currentVideo]);

  // Seek to specific time point
  const seekToTime = (seconds) => {
    if (!videoRef.current) {
      console.error("[ERROR] Seek failed: No video element");
      return;
    }
    
    try {
      console.log(`[DEBUG] Requesting seek to ${seconds} seconds`);
      const video = videoRef.current;
      
      // If seeking from subtitle list, may need to adjust loop state
      const isSubtitleListJump = true; // Assume all external jumps are from subtitle list
      const wasLooping = isLoopingSubtitle;
      let targetSubtitleIndex = -1;
      
      // Try to find subtitle index for the seek time
      if (parsedSubtitles && Array.isArray(parsedSubtitles) && parsedSubtitles.length > 0) {
        const targetMs = seconds * 1000;
        
        // Use binary search for quick subtitle location
        if (parsedSubtitles.length > 100) {
          let low = 0;
          let high = parsedSubtitles.length - 1;
          
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const subtitle = parsedSubtitles[mid];
            
            if (!subtitle || typeof subtitle.start !== 'number') {
              continue;
            }
            
            if (targetMs >= subtitle.start && targetMs <= subtitle.end) {
              targetSubtitleIndex = mid;
              break;
            } else if (subtitle.start > targetMs) {
              high = mid - 1;
            } else {
              low = mid + 1;
            }
          }
        } else {
          // Linear search for small datasets
          for (let i = 0; i < parsedSubtitles.length; i++) {
            const subtitle = parsedSubtitles[i];
            if (subtitle && typeof subtitle.start === 'number' &&
                targetMs >= subtitle.start && targetMs <= subtitle.end) {
              targetSubtitleIndex = i;
              break;
            }
          }
        }
      }
      
      // If currently looping and this is external jump, temporarily disable loop
      if (wasLooping && isSubtitleListJump) {
        // Temporarily disable looping
        setIsLoopingSubtitle(false);
        setCurrentLoopingSubtitleIndex(-1);
      }
      
      // Record video current state
      console.log("Video state before seek", {
        readyState: video.readyState,
        networkState: video.networkState,
        paused: video.paused,
        currentTime: video.currentTime,
        duration: video.duration,
        error: video.error
      });
      
      // Check if video is ready
      if (video.readyState >= 2) {
        // Video ready, can seek directly
        try {
          video.currentTime = seconds;
          console.log(`Direct seek to ${seconds}s successful`);
          
          // Manually update subtitle index
          if (targetSubtitleIndex >= 0) {
            setCurrentSubtitleIndex(targetSubtitleIndex);
          }
          
          // If video paused, try to play
          if (video.paused) {
            console.log("Video paused, attempting to play");
            video.play().then(() => {
              console.log("Post-seek playback successful");
            }).catch(e => {
              console.error("Post-seek playback failed", e);
            });
          }
          
          // If previously looping, re-enable with new subtitle index
          if (wasLooping && isSubtitleListJump && targetSubtitleIndex >= 0) {
            // Short delay before re-enabling loop
            setTimeout(() => {
              setCurrentLoopingSubtitleIndex(targetSubtitleIndex);
              setIsLoopingSubtitle(true);
              // Reset loop count
              setSubtitleLoopCount(0);
            }, 100);
          }
        } catch (e) {
          console.error("Direct seek failed", e);
        }
      } else {
        // Video not ready, set up event listener
        console.log("Video not ready, waiting for load before seeking");
        
        const handleCanPlay = () => {
          // Remove event listeners to avoid duplicate calls
          console.log("canplay/loadedmetadata event triggered, preparing to seek");
          video.removeEventListener('canplay', handleCanPlay);
          video.removeEventListener('loadedmetadata', handleCanPlay);
          
          // Set video current time
          try {
            // Add short delay before seeking
            setTimeout(() => {
              try {
                video.currentTime = seconds;
                console.log(`Delayed seek to ${seconds}s successful`);
                
                // Manually update subtitle index
                if (targetSubtitleIndex >= 0) {
                  setCurrentSubtitleIndex(targetSubtitleIndex);
                }
                
                // If video paused, try to play
                if (video.paused) {
                  console.log("Video paused, attempting to play");
                  video.play().then(() => {
                    console.log("Post-seek playback successful");
                  }).catch(e => {
                    console.error("Post-seek playback failed", e);
                  });
                }
                
                // If previously looping, re-enable with new subtitle index
                if (wasLooping && isSubtitleListJump && targetSubtitleIndex >= 0) {
                  // Short delay before re-enabling loop
                  setTimeout(() => {
                    setCurrentLoopingSubtitleIndex(targetSubtitleIndex);
                    setIsLoopingSubtitle(true);
                    // Reset loop count
                    setSubtitleLoopCount(0);
                  }, 100);
                }
              } catch (delayErr) {
                console.error("Delayed seek failed", delayErr);
              }
            }, 200);
          } catch (err) {
            console.error("Seek time setting failed", err);
          }
        };
        
        // Add two event handlers, ensure at least one triggers
        console.log("Adding canplay and loadedmetadata event listeners");
        video.addEventListener('canplay', handleCanPlay, { once: true });
        video.addEventListener('loadedmetadata', handleCanPlay, { once: true });
        
        // If video metadata already loaded, call handler immediately
        if (video.readyState >= 1) {
          console.log("Video metadata already loaded, calling handler directly");
          handleCanPlay();
        }
      }
    } catch (e) {
      console.error("Overall video seek process error", e);
    }
  };

  // Toggle subtitle list display
  const toggleSubtitleList = () => {
    setShowSubtitleList(!showSubtitleList);
  };

  // Toggle play/pause state
  const togglePlayPause = () => {
    console.log('Toggling play/pause state');

    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play()
        .then(() => setIsPaused(false))
        .catch(e => console.error("Play failed:", e));
    } else {
      video.pause();
      setIsPaused(true);
    }
  };
  
  // Update paused state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handlePause = () => setIsPaused(true);
    const handlePlay = () => setIsPaused(false);
    
    video.addEventListener('pause', handlePause);
    video.addEventListener('play', handlePlay);
    
    return () => {
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('play', handlePlay);
    };
  }, []);

  // Request fullscreen display
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
      console.error("Fullscreen request failed:", e);
    }
  };

  // Monitor fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement = 
        document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement || 
        document.msFullscreenElement;
      
      setIsFullscreen(!!fullscreenElement);
      console.log('全屏状态变化:', !!fullscreenElement);
      
      // Update subtitle display
      if (fullscreenElement && subtitleContent) {
        // Short delay to ensure subtitle displays above video controls
        setTimeout(() => {
          // Use external subtitle in fullscreen mode
          const externalSubtitle = document.getElementById('external-subtitle-overlay');
          if (externalSubtitle) {
            console.log('设置外部字幕可见');
            externalSubtitle.style.visibility = 'visible';
            externalSubtitle.style.opacity = '1';
            externalSubtitle.classList.add('active');
            externalSubtitle.style.pointerEvents = 'auto';
            externalSubtitle.style.zIndex = '2147483647';
            
            // Special handling in Electron environment
            if (window.navigator && window.navigator.userAgent.includes('Electron')) {
              if (externalSubtitle.parentElement !== document.body) {
                document.body.appendChild(externalSubtitle);
                console.log('字幕已附加到document.body');
              }
            }
          } else {
            console.error('找不到外部字幕容器');
          }
        }, 300);
      } else {
        // Restore original state when exiting fullscreen
        const externalSubtitle = document.getElementById('external-subtitle-overlay');
        if (externalSubtitle) {
          console.log('隐藏外部字幕');
          externalSubtitle.style.visibility = 'hidden';
          externalSubtitle.style.opacity = '0';
          externalSubtitle.classList.remove('active');
          
          // If moved to body, restore original position
          if (externalSubtitle.parentElement === document.body) {
            const container = document.querySelector('.custom-video-container');
            if (container) {
              container.appendChild(externalSubtitle);
              console.log('字幕已还原到视频容器');
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

  // Toggle subtitle blur state
  const toggleSubtitleBlur = () => {
    try {
      // Simplify state update logic
      const currentState = isSubtitleBlurred === true;
      const newState = !currentState;
      
      console.log('[DEBUG] Subtitle blur button clicked, current state:', currentState, 'switching to:', newState);
      
      // Set new state directly
      setIsSubtitleBlurred(newState);
      
      // Notify user of blur state change
      setStatusMessage(newState ? 'Subtitles blurred' : 'Subtitles normal display');
      setTimeout(() => setStatusMessage(''), 2000);
      
      // Remember user's choice
      try {
        localStorage.setItem('subtitle-blur-enabled', String(newState));
      } catch (storageErr) {
        console.error('[ERROR] Failed to save subtitle blur setting:', storageErr);
      }
      
      // Perform memory optimization in Electron
      if (isElectron() && window.electronAPI) {
        setTimeout(() => {
          if (typeof window.electronAPI.optimizeRenderer === 'function') {
            window.electronAPI.optimizeRenderer().catch(e => 
              console.error('Renderer optimization failed:', e)
            );
          }
        }, 100);
      }
      
    } catch (err) {
      console.error('[ERROR] Failed to toggle subtitle blur state:', err);
      // Notify user of error
      setStatusMessage('Subtitle blur toggle failed');
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  // Safely get subtitle blur state as boolean
  const getBlurEnabledState = () => {
    // Simplified function, return boolean directly
    return isSubtitleBlurred === true;
  };

  // Get subtitle controller functions
  const subtitleController = SubtitleController({
    subtitleContent,
    currentTime,
    parsedSubtitles,
    setParsedSubtitles,
    currentSubtitleIndex,
    setCurrentSubtitleIndex,
    isLoopingSubtitle,
    currentLoopingSubtitleIndex,
    seekToTime,
    videoRef,
    setIsLoopingSubtitle,
    setCurrentLoopingSubtitleIndex,
    setSubtitleLoopCount,
    setStatusMessage
  });
  
  // Store subtitle controller functions in refs to use in event handlers
  const goToNextSubtitleRef = useRef(subtitleController.goToNextSubtitle);
  const goToPreviousSubtitleRef = useRef(subtitleController.goToPreviousSubtitle);
  const toggleSubtitleLoopRef = useRef(subtitleController.toggleSubtitleLoop);
  // Update refs when the controller functions change
  useEffect(() => {
    goToNextSubtitleRef.current = subtitleController.goToNextSubtitle;
    goToPreviousSubtitleRef.current = subtitleController.goToPreviousSubtitle;
    toggleSubtitleLoopRef.current = subtitleController.toggleSubtitleLoop;
  }, [subtitleController]);

  // Add keyboard shortcut support
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check if video player loaded
      if (!videoRef.current || !parsedSubtitles || !Array.isArray(parsedSubtitles) || !parsedSubtitles.length) {
        return;
      }
      
      try {
        // Ctrl+N: Next subtitle
        if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
          e.preventDefault(); // Prevent default behavior (e.g., opening new window in browser)
          console.log('[DEBUG] Keyboard shortcut detected: Ctrl+N, jumping to next subtitle');
          
          // Use the stored function reference instead of creating a new SubtitleController
          if (goToNextSubtitleRef.current) {
            goToNextSubtitleRef.current();
          }
        }
        
        // Ctrl+B: Previous subtitle
        if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
          e.preventDefault(); // Prevent default behavior
          console.log('[DEBUG] Keyboard shortcut detected: Ctrl+B, jumping to previous subtitle');
          
          // Use the stored function reference instead of creating a new SubtitleController
          if (goToPreviousSubtitleRef.current) {
            goToPreviousSubtitleRef.current();
          }
        }

        if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault(); // Prevent default behavior
          console.log('[DEBUG] Keyboard shortcut detected: Ctrl+K, toggle loop subtitle');
          
          // Use the stored function reference instead of creating a new SubtitleController
          if (toggleSubtitleLoopRef.current) {
            toggleSubtitleLoopRef.current();
          }        
        }

      } catch (err) {
        console.error('[ERROR] Keyboard shortcut handling failed:', err);
      }
    };
    
    // Add keyboard event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup function
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [parsedSubtitles]); // Simplified dependencies

  // Debug logging
  useEffect(() => {
    if (currentVideo) {
      console.log('===== VIDEO DEBUG INFO =====');
      console.log('Current video:', currentVideo);
      console.log('Video URL:', currentVideo?.url ? `${currentVideo.url.substring(0, 100)}...` : 'none');
      console.log('Video element exists:', !!videoRef.current);
      console.log('===========================');
    }
  }, [currentVideo]);

  // Create a function to temporarily disable pointer events on video when dragging subtitles
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    
    // Function to handle subtitle drag state changes
    const handleSubtitleDragStart = () => {
      console.log('字幕开始拖拽，临时禁用视频指针事件');
      if (videoElement) {
        videoElement.style.pointerEvents = 'none';
      }
    };
    
    const handleSubtitleDragEnd = () => {
      // console.log('字幕拖拽结束，恢复视频指针事件');
      if (videoElement) {
        videoElement.style.pointerEvents = 'auto';
      }
    };
    
    // Listen for custom events that can be dispatched from SubtitleDisplay
    window.addEventListener('subtitle-drag-start', handleSubtitleDragStart);
    window.addEventListener('subtitle-drag-end', handleSubtitleDragEnd);
    
    return () => {
      window.removeEventListener('subtitle-drag-start', handleSubtitleDragStart);
      window.removeEventListener('subtitle-drag-end', handleSubtitleDragEnd);
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
                  (Subtitle: {currentSubtitle.name})
                </span>
              )}
            </h2>
            
            {currentSubtitle && (
              <button 
                className="btn btn-xs btn-ghost"
                onClick={toggleSubtitleList}
              >
                {showSubtitleList ? 'Hide Subtitles' : 'Show Subtitles'}
              </button>
            )}
          </div>
          
          <div className="flex flex-1 gap-2 min-h-0 overflow-hidden">
            {/* Video playback area */}
            <div className={`relative flex-1 ${showSubtitleList && currentSubtitle ? 'w-7/12' : 'w-full'}`}>
              {/* Subtitle tip message */}
              {showSubtitleTip && (
                <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg z-30 text-sm text-center whitespace-nowrap">
                  <div className="flex items-center">
                    <span className="mr-2">👋</span>
                    <span>字幕可拖动! 点击并拖拽字幕可调整位置，双击重置</span>
                    <span className="ml-2 cursor-pointer" onClick={() => {
                      setShowSubtitleTip(false);
                      localStorage.setItem('subtitle-tip-shown', 'true');
                    }}>✕</span>
                  </div>
                </div>
              )}
              
              {/* Keyboard shortcut tip */}
              {showKeyboardShortcutTip && (
                <div className="absolute top-24 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg z-30 text-sm text-center whitespace-nowrap">
                  Tip: Use keyboard shortcuts Ctrl+N (next) and Ctrl+B (previous) to navigate subtitles
                </div>
              )}
              
              {videoStatus === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-white z-10">
                  <div className="text-center">
                    <div className="text-xl mb-2">Video failed to load</div>
                    <div className="text-sm text-gray-300">Please try another video or refresh the page</div>
                    <button 
                      className="mt-4 btn btn-sm btn-outline btn-warning"
                      onClick={() => window.location.reload()}
                    >
                      Refresh Page
                    </button>
                  </div>
                </div>
              )}
              
              {/* Player controls */}
              <PlayerControls 
                subtitleContent={subtitleContent}
                isLoopingSubtitle={isLoopingSubtitle}
                subtitleLoopCount={subtitleLoopCount}
                currentLoopingSubtitleIndex={currentLoopingSubtitleIndex}
                currentSubtitleIndex={currentSubtitleIndex}
                parsedSubtitles={parsedSubtitles}
                isPaused={isPaused}
                togglePlayPause={togglePlayPause}
                goToPreviousSubtitle={subtitleController.goToPreviousSubtitle}
                goToNextSubtitle={subtitleController.goToNextSubtitle}
                toggleSubtitleLoop={subtitleController.toggleSubtitleLoop}
                toggleSubtitleBlur={toggleSubtitleBlur}
                isSubtitleBlurred={getBlurEnabledState()}
                requestFullscreen={requestFullscreen}
              />
              
              {/* Status message display */}
              {statusMessage && (
                <div className="absolute top-12 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-80 text-white px-4 py-2 rounded-lg z-30 text-sm whitespace-nowrap">
                  {statusMessage}
                </div>
              )}
              
              <div className="video-container relative">
                {/* Video loading indicator */}
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
                
                {/* Video container with embedded subtitles */}
                <div className="custom-video-container relative w-full h-full" style={{ overflow: 'hidden' }}>
                  <div className="video-wrapper relative w-full h-full">
                    <video 
                      ref={videoRef}
                      className="w-full h-full rounded bg-gray-900 object-contain"
                      controls
                      autoPlay
                      playsInline
                      data-subtitle-draggable="true"
                      onLoadedMetadata={handleLoadedMetadata}
                      style={{
                        minHeight: '300px',
                        maxHeight: '70vh',
                        border: '1px solid #333',
                        display: 'block',
                        backgroundColor: '#000'
                      }}
                      crossOrigin="anonymous"
                    />
                    
                    {/* Video core logic component */}
                    {currentVideo && (
                      <VideoPlayer 
                        key={`video-player-${currentVideo.url}`}
                        currentVideo={currentVideo}
                        onTimeUpdate={setCurrentTime}
                        onPlayerReady={() => {}}
                        onError={() => {}}
                        onStatusChange={setVideoStatus}
                        videoRef={videoRef}
                        isFullscreen={isFullscreen}
                      />
                    )}
                    
                    {/* Subtitle loop controller */}
                    <SubtitleLoop 
                      isLoopingSubtitle={isLoopingSubtitle}
                      currentSubtitleIndex={currentSubtitleIndex}
                      parsedSubtitles={parsedSubtitles}
                      currentLoopingSubtitleIndex={currentLoopingSubtitleIndex}
                      videoRef={videoRef}
                      setSubtitleLoopCount={setSubtitleLoopCount}
                      setCurrentSubtitleIndex={setCurrentSubtitleIndex}
                      audioRef={audioRef}
                    />
                    
                    {/* Video embedded subtitle layer - absolutely positioned above video */}
                    {subtitleContent && currentTime > 0 && !isFullscreen && (
                      <div className="inner-subtitle-overlay" style={{ pointerEvents: 'none' }}>
                        <SubtitleDisplay 
                          subtitleContent={subtitleContent}
                          currentTime={currentTime}
                          isFullscreen={false}
                          isBlurred={getBlurEnabledState()}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Video external subtitle layer - backup, for when embedded subtitles may not display in fullscreen */}
              {subtitleContent && currentTime > 0 && (
                <div 
                  id="external-subtitle-overlay"
                  className="external-subtitle-overlay" 
                  style={{
                    opacity: isFullscreen ? 1 : 0,
                    visibility: isFullscreen ? 'visible' : 'hidden',
                    pointerEvents: isFullscreen ? 'none' : 'none',
                    zIndex: isFullscreen ? 2147483647 : 'auto'
                  }}
                >
                  <SubtitleDisplay 
                    subtitleContent={subtitleContent}
                    currentTime={currentTime}
                    isFullscreen={true}
                    isBlurred={getBlurEnabledState()}
                  />
                </div>
              )}
            </div>
            
            {/* Advanced features area - includes subtitle list and parsing */}
            {showSubtitleList && currentSubtitle && (
              <div className="w-5/12 min-w-[280px] max-w-[400px] subtitle-container border border-gray-200 rounded overflow-hidden">
                <div className="subtitle-list-header bg-gray-100 px-3 py-2 border-b border-gray-200 text-sm font-medium flex items-center justify-between">
                  <span>Advanced Features</span>
                </div>
                <div className="subtitle-list-body bg-gray-50 flex-1 h-full overflow-hidden">
                  <AdvancedPanel 
                    subtitleContent={subtitleContent}
                    currentTime={currentTime}
                    onSubtitleClick={seekToTime}
                  />
                </div>
              </div>
            )}
          </div>
          {/* nt.mp3 sound effect */}
          <audio ref={audioRef} src={ntMp3} preload="auto" hidden />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-xl mb-2">Video failed to load</div>
            <div className="text-sm text-gray-300">Please try another video or refresh the page</div>
            <button 
              className="mt-4 btn btn-sm btn-outline btn-warning"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayerPanel; 