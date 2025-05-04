import { useEffect } from 'react';

const SubtitleLoop = ({ 
  isLoopingSubtitle, 
  currentSubtitleIndex,
  parsedSubtitles,
  currentLoopingSubtitleIndex, 
  videoRef,
  setSubtitleLoopCount,
  setCurrentSubtitleIndex,
  audioRef,
  subtitleLoopCount
}) => {
  
  // Monitor subtitle looping
  useEffect(() => {
    // Print simple initial state log
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] Subtitle loop state:', isLoopingSubtitle ? 'enabled' : 'disabled');
    }
    
    // If not enabled, reset loop count and exit
    if (!isLoopingSubtitle) {
      setSubtitleLoopCount(0);
      return;
    }
    
    // Save current looping subtitle index to prevent switching during loop
    const lockedSubtitleIndex = currentSubtitleIndex;
    
    // If current index is invalid, can't start looping
    if (lockedSubtitleIndex < 0 || !parsedSubtitles || !Array.isArray(parsedSubtitles) || 
        lockedSubtitleIndex >= parsedSubtitles.length) {
      console.warn('[WARN] Invalid or non-existent subtitle to loop, cannot enable looping');
      return;
    }
    
    // Record subtitle to loop, add robustness
    let loopSubtitle = null;
    if (lockedSubtitleIndex >= 0 && 
        parsedSubtitles && 
        Array.isArray(parsedSubtitles) &&
        lockedSubtitleIndex < parsedSubtitles.length) {
      loopSubtitle = { ...parsedSubtitles[lockedSubtitleIndex] };
      console.log(`[DEBUG] Locked looping subtitle: #${lockedSubtitleIndex}, start time: ${loopSubtitle.start}ms, end time: ${loopSubtitle.end}ms`);
    } else {
      console.warn('[WARN] Invalid or non-existent subtitle to loop, cannot enable looping');
      return;
    }
    
    // Ensure subtitle is valid
    if (!loopSubtitle || 
        typeof loopSubtitle.start !== 'number' || 
        typeof loopSubtitle.end !== 'number') {
      console.warn('[WARN] Invalid subtitle timing, cannot enable looping');
      return;
    }
    
    // Use setInterval instead of event listener
    const intervalId = setInterval(() => {
      try {
        const video = videoRef.current;
        if (!video || video.paused) return;
        const currentMs = video.currentTime * 1000;
        
        // Important: maintain current subtitle index during each check to prevent auto-switching
        if (currentSubtitleIndex !== lockedSubtitleIndex) {
          setCurrentSubtitleIndex(lockedSubtitleIndex);
        }
        
        // Check if playback has gone beyond the current looping subtitle range
        if (currentMs < loopSubtitle.start || currentMs > loopSubtitle.end) {
          try {
            // New: pause video, play nt.mp3, jump back to subtitle start after 2 seconds
            video.pause();
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play();
            }
            setTimeout(() => {
              video.currentTime = loopSubtitle.start / 1000;
              video.play();
              setSubtitleLoopCount(prevCount => {
                const newCount = prevCount + 1;
                console.log(`[DEBUG] Subtitle loop count: ${newCount}`);
                
                // 根据新的循环次数立即调整播放速度
                updatePlaybackRate(video, newCount);
                
                return newCount;
              });
              // Important: force update current subtitle index to prevent switching by auto-update mechanism
              if (currentSubtitleIndex !== lockedSubtitleIndex) {
                setCurrentSubtitleIndex(lockedSubtitleIndex);
              }
            }, 1000);
          } catch (e) {
            console.error('[ERROR] Subtitle loop jump failed:', e);
          }
        }
      } catch (e) {
        // Catch errors but don't do complex handling
        console.error('[ERROR] Subtitle loop processing error:', e);
      }
    }, 100);
    
    // Simple cleanup function
    return () => {
      console.log('[DEBUG] Cleaning up subtitle loop timer');
      clearInterval(intervalId);
      
      // Restore normal playback speed
      try {
        if (videoRef.current) {
          videoRef.current.playbackRate = 1.0;
        }
      } catch (e) {
        console.error('[ERROR] Failed to restore playback speed:', e);
      }
    };
  }, [isLoopingSubtitle, currentSubtitleIndex, parsedSubtitles, currentLoopingSubtitleIndex, setSubtitleLoopCount, setCurrentSubtitleIndex, videoRef, audioRef]);

  // 辅助函数：强制更新播放速度
  const updatePlaybackRate = (video, count) => {
    if (!video) return;
    
    try {
      let newRate = 1.0;
      if (count >= 10) {
        newRate = 0.5;
        console.log(`[DEBUG] 强制减慢播放速度: 0.5x (循环次数: ${count})`);
      } else if (count >= 5) {
        newRate = 0.75;
        console.log(`[DEBUG] 强制减慢播放速度: 0.75x (循环次数: ${count})`);
      } else {
        console.log(`[DEBUG] 保持正常播放速度: 1.0x (循环次数: ${count})`);
      }
      
      if (video.playbackRate !== newRate) {
        video.playbackRate = newRate;
        console.log(`[DEBUG] 播放速度已更新为 ${newRate}x (之前: ${video.playbackRate}x)`);
      }
    } catch (e) {
      console.error('[ERROR] 更新播放速度失败:', e);
    }
  };
  
  // 监视循环计数的变化，每当循环计数更新时调整播放速度
  useEffect(() => {
    if (!isLoopingSubtitle || !videoRef.current) return;
    
    const video = videoRef.current;
    console.log(`[DEBUG] 循环计数发生变化: ${subtitleLoopCount}, 更新播放速度`);
    
    updatePlaybackRate(video, subtitleLoopCount);
    
  }, [subtitleLoopCount, isLoopingSubtitle]);

  return null; // This is a logic-only component
};

export default SubtitleLoop; 