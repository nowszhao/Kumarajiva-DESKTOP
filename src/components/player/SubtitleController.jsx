import { useEffect } from 'react';
import { parseAssSubtitles } from '../../utils/subtitleUtils';

const SubtitleController = ({
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
}) => {
  // Parse subtitle content
  useEffect(() => {
    if (subtitleContent) {
      try {
        console.log('[DEBUG] Starting to parse subtitle content, length:', subtitleContent.length);
        console.log('[DEBUG] Subtitle content first 100 chars:', subtitleContent.substring(0, 100).replace(/\n/g, '\\n'));
        
        // Save subtitle content to localStorage for debugging
        try {
          localStorage.setItem('debug_subtitle_content', subtitleContent.substring(0, 4000));
          console.log('[DEBUG] Saved subtitle content to localStorage for debugging');
          
          // Save to local file for detailed debugging - if in Electron environment
          if (window.electronAPI && window.electronAPI.debugSaveSubtitle) {
            console.log('[DEBUG] Attempting to save subtitle content to local file');
            window.electronAPI.debugSaveSubtitle(subtitleContent)
              .then(() => console.log('[DEBUG] Subtitle content saved to local file'))
              .catch(err => console.error('[ERROR] Failed to save subtitle content:', err));
          }
        } catch (err) {
          console.error('[ERROR] Failed to save subtitle content to localStorage:', err);
        }
        
        // Use enhanced subtitleUtils to parse subtitles - will auto-detect and parse various formats
        const parsed = parseAssSubtitles(subtitleContent);
        
        console.log(`[DEBUG] Subtitle parsing result: ${parsed ? parsed.length : 0} subtitles`, {
          parsed,
          firstItem: parsed && parsed.length > 0 ? parsed[0] : null,
          lastItem: parsed && parsed.length > 0 ? parsed[parsed.length - 1] : null
        });
        
        if (parsed && parsed.length > 0) {
          setParsedSubtitles(parsed);
          console.log(`[DEBUG] Subtitle controller parsing successful, ${parsed.length} entries`);
        } else {
          console.warn('[WARN] Subtitle parsing result is empty, creating placeholder subtitle');
          // Create a placeholder subtitle even if parsing fails to enable control buttons
          setParsedSubtitles([{
            start: 0,
            end: 10000,
            text: 'Subtitle parsing failed, but control buttons are enabled'
          }]);
        }
      } catch (e) {
        console.error('[ERROR] Subtitle controller parsing error:', e);
        // Ensure we set to empty array, not undefined or null
        setParsedSubtitles([{
          start: 0,
          end: 10000,
          text: 'Subtitle parsing error: ' + e.message
        }]);
      }
    } else {
      console.log('[DEBUG] No subtitle content, resetting subtitle state');
      setParsedSubtitles([]);
    }
  }, [subtitleContent, setParsedSubtitles]);
  
  // Update current subtitle index
  useEffect(() => {
    if (!currentTime || !parsedSubtitles || !Array.isArray(parsedSubtitles) || !parsedSubtitles.length) {
      setCurrentSubtitleIndex(-1);
      return;
    }
    
    // If currently looping a subtitle, and have locked a specific subtitle, don't update index
    if (isLoopingSubtitle && currentLoopingSubtitleIndex >= 0) {
      // Keep using current looping subtitle index
      return;
    }
    
    const currentMs = currentTime * 1000;
    
    // Use efficient search method for large subtitle data
    let foundIndex = -1;
    
    // Optimize for large subtitle sets (>100 entries)
    if (parsedSubtitles.length > 100) {
      // Start searching from current index, leveraging time continuity
      if (currentSubtitleIndex >= 0 && currentSubtitleIndex < parsedSubtitles.length) {
        const current = parsedSubtitles[currentSubtitleIndex];
        // Check if current subtitle is still valid
        if (current && typeof current.start === 'number' && typeof current.end === 'number') {
          if (currentMs >= current.start && currentMs <= current.end) {
            // Current subtitle still valid, no need to change
            return;
          }
          
          // Check if next subtitle matches (common case)
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
      
      // Use binary search for better performance
      let low = 0;
      let high = parsedSubtitles.length - 1;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        
        // Add safety check
        if (!parsedSubtitles[mid] || typeof parsedSubtitles[mid].start !== 'number') {
          break;
        }
        
        const start = parsedSubtitles[mid].start;
        const end = parsedSubtitles[mid].end || (start + 5000); // Default 5 seconds
        
        if (currentMs >= start && currentMs <= end) {
          // Found matching subtitle
          foundIndex = mid;
          break;
        } else if (start > currentMs) {
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
    } 
    // For smaller subtitle data, use linear search
    else {
      // Find subtitle for current time
      for (let i = 0; i < parsedSubtitles.length; i++) {
        // Add safety check
        if (!parsedSubtitles[i] || typeof parsedSubtitles[i].start !== 'number') {
          continue;
        }
        
        if (currentMs >= parsedSubtitles[i].start && currentMs <= parsedSubtitles[i].end) {
          foundIndex = i;
          break;
        }
      }
    }
    
    // Update current subtitle index
    if (foundIndex !== currentSubtitleIndex) {
      setCurrentSubtitleIndex(foundIndex);
    }
  }, [currentTime, parsedSubtitles, currentSubtitleIndex, isLoopingSubtitle, currentLoopingSubtitleIndex, setCurrentSubtitleIndex]);

  // Go to previous subtitle
  const goToPreviousSubtitle = () => {
    try {
      if (!parsedSubtitles || !Array.isArray(parsedSubtitles) || !parsedSubtitles.length || !videoRef.current) {
        console.warn('[WARN] No available subtitle data or video element');
        return;
      }
      
      const video = videoRef.current;
      video.pause();
      
      // Save current loop state
      const wasLooping = isLoopingSubtitle;
      
      // Force disable looping, unlocking current subtitle
      setIsLoopingSubtitle(false);
      setCurrentLoopingSubtitleIndex(-1); // Reset locked index
      
      // Safety check - ensure subtitle array structure is correct
      const MAX_SUBTITLES = 10000; // Reasonable max, prevent infinite loops
      if (parsedSubtitles.length > MAX_SUBTITLES) {
        console.warn('[WARN] Abnormally large subtitle data, might be incorrect', parsedSubtitles.length);
        return;
      }
      
      let targetIndex = currentSubtitleIndex - 1;
      
      // If no active subtitle or at first subtitle, find nearest subtitle
      if (targetIndex < 0) {
        const currentMs = videoRef.current.currentTime * 1000;
        
        // For large subtitle data, use optimized search
        if (parsedSubtitles.length > 100) {
          // Default to first subtitle
          targetIndex = 0;
          
          // Use binary search to find approximate position
          let low = 0;
          let high = parsedSubtitles.length - 1;
          let closestBeforeCurrent = -1;
          
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const subtitle = parsedSubtitles[mid];
            
            // Safety check
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
          
          // If found subtitle before current time, use it
          if (closestBeforeCurrent !== -1) {
            targetIndex = closestBeforeCurrent;
          }
        } 
        // For small subtitle data, use linear search
        else {
          // Find last subtitle before current time
          for (let i = parsedSubtitles.length - 1; i >= 0; i--) {
            const subtitle = parsedSubtitles[i];
            if (subtitle && typeof subtitle.start === 'number' && 
                subtitle.start < currentMs) {
              targetIndex = i;
              break;
            }
          }
        }
        
        // If still not found, use first subtitle
        if (targetIndex < 0 && parsedSubtitles.length > 0) {
          targetIndex = 0;
        }
      }
      
      // If target subtitle found, jump to its start time
      if (targetIndex >= 0 && targetIndex < parsedSubtitles.length && 
          parsedSubtitles[targetIndex] && typeof parsedSubtitles[targetIndex].start === 'number') {
        const targetTime = parsedSubtitles[targetIndex].start / 1000;
        
        // Safety check - ensure jump time is valid
        if (!isNaN(targetTime) && targetTime >= 0 && targetTime < videoRef.current.duration) {
          console.log(`[DEBUG] Jumping to previous subtitle: #${targetIndex}, time: ${targetTime}s`);
          
          // Update current subtitle index manually before jump
          setCurrentSubtitleIndex(targetIndex);
          
          // Jump to target subtitle time
          seekToTime(targetTime);
        } else {
          console.warn(`[WARN] Invalid subtitle jump time: ${targetTime}`);
        }
      }

      // Re-enable looping (if previously enabled)
      // But use new subtitle index as loop target
      if (wasLooping) {
        // Short delay before enabling looping, ensure subtitle index is properly updated
        setTimeout(() => {
          // Set loop for new subtitle
          setCurrentLoopingSubtitleIndex(targetIndex);
          setIsLoopingSubtitle(true);
          
          // Reset loop count to 0 since switching to new subtitle
          setSubtitleLoopCount(0);
          
          // Reset playback speed to normal
          if (videoRef.current) {
            videoRef.current.playbackRate = 1.0;
          }
        }, 100);
      }
      
      video.play();
    } catch (err) {
      console.error('[ERROR] Failed to switch to previous subtitle:', err);
    }
  };
  
  // Go to next subtitle
  const goToNextSubtitle = () => {
    console.log('Switching to next subtitle');

    try {
      if (!parsedSubtitles || !Array.isArray(parsedSubtitles) || !parsedSubtitles.length || !videoRef.current) {
        console.warn('[WARN] No available subtitle data or video element');
        return;
      }
      
      const video = videoRef.current;
      video.pause();
      
      // Save current loop state
      const wasLooping = isLoopingSubtitle;
      
      // Force disable looping, unlocking current subtitle
      setIsLoopingSubtitle(false);
      setCurrentLoopingSubtitleIndex(-1); // Reset locked index

      // Safety check - ensure subtitle array structure is correct
      const MAX_SUBTITLES = 10000; // Reasonable max, prevent infinite loops
      if (parsedSubtitles.length > MAX_SUBTITLES) {
        console.warn('[WARN] Abnormally large subtitle data, might be incorrect', parsedSubtitles.length);
        return;
      }
      
      let targetIndex = currentSubtitleIndex + 1;
      
      // If at last subtitle or no active subtitle, find next suitable subtitle
      if (targetIndex >= parsedSubtitles.length || targetIndex < 0) {
        const currentMs = videoRef.current.currentTime * 1000;
        
        // For large subtitle data, use optimized search
        if (parsedSubtitles.length > 100) {
          // Default to first subtitle
          targetIndex = 0;
          
          // Use binary search to find approximate position
          let low = 0;
          let high = parsedSubtitles.length - 1;
          let closestAfterCurrent = -1;
          
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const subtitle = parsedSubtitles[mid];
            
            // Safety check
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
          
          // If found subtitle after current time, use it
          if (closestAfterCurrent !== -1) {
            targetIndex = closestAfterCurrent;
          }
        }
        // For small subtitle data, use linear search
        else {
          // Find first subtitle after current time
          for (let i = 0; i < parsedSubtitles.length; i++) {
            const subtitle = parsedSubtitles[i];
            if (subtitle && typeof subtitle.start === 'number' && 
                subtitle.start > currentMs) {
              targetIndex = i;
              break;
            }
          }
        }
        
        // If no next subtitle found, loop back to first
        if (targetIndex >= parsedSubtitles.length) {
          targetIndex = 0;
        }
      }
      
      // Jump to target subtitle start time
      if (targetIndex >= 0 && targetIndex < parsedSubtitles.length && 
          parsedSubtitles[targetIndex] && typeof parsedSubtitles[targetIndex].start === 'number') {
        const targetTime = parsedSubtitles[targetIndex].start / 1000;
        
        // Safety check - ensure jump time is valid
        if (!isNaN(targetTime) && targetTime >= 0 && targetTime < videoRef.current.duration) {
          console.log(`[DEBUG] Jumping to next subtitle: #${targetIndex}, time: ${targetTime}s`);
          
          // Update current subtitle index manually before jump
          setCurrentSubtitleIndex(targetIndex);
          
          // Jump to target subtitle time
          seekToTime(targetTime);
        } else {
          console.warn(`[WARN] Invalid subtitle jump time: ${targetTime}`);
        }
      }

      // Re-enable looping (if previously enabled)
      // But use new subtitle index as loop target
      if (wasLooping) {
        // Short delay before enabling looping, ensure subtitle index is properly updated
        setTimeout(() => {
          // Set loop for new subtitle
          setCurrentLoopingSubtitleIndex(targetIndex);
          setIsLoopingSubtitle(true);
          
          // Reset loop count to 0 since switching to new subtitle
          setSubtitleLoopCount(0);
          
          // Reset playback speed to normal
          if (videoRef.current) {
            videoRef.current.playbackRate = 1.0;
          }
        }, 100);
      }
      
      video.play();
    } catch (err) {
      console.error('[ERROR] Failed to switch to next subtitle:', err);
    }
  };
  
  // Toggle subtitle loop state
  const toggleSubtitleLoop = () => {
    try {
      // Get current loop state
      const newLoopState = !isLoopingSubtitle;

      // Disable looping case
      if (!newLoopState) {
        // Notify user that looping is disabled
        setStatusMessage('Subtitle loop disabled');
        setTimeout(() => setStatusMessage(''), 3000);
        setIsLoopingSubtitle(false);
        
        // Reset loop count and current looping subtitle index
        setSubtitleLoopCount(0);
        setCurrentLoopingSubtitleIndex(-1);
        
        // Restore normal playback speed
        if (videoRef.current) {
          videoRef.current.playbackRate = 1.0;
        }
        
        return;
      }
      
      // Various checks before enabling looping
      
      // 1. Check if subtitle content exists
      if (!parsedSubtitles || !Array.isArray(parsedSubtitles) || parsedSubtitles.length === 0) {
        console.warn('[WARN] No available subtitle data, cannot enable looping');
        setStatusMessage('Cannot enable looping: no subtitle content');
        setTimeout(() => setStatusMessage(''), 3000);
        return;
      }
      
      // 2. Check if there is a currently selected subtitle
      if (currentSubtitleIndex < 0 || currentSubtitleIndex >= parsedSubtitles.length) {
        console.warn('[WARN] Enabling loop but no current subtitle, operation invalid');
        setStatusMessage('Please play to a position with subtitle before enabling loop');
        setTimeout(() => setStatusMessage(''), 3000);
        return;
      }
      
      // 3. Check if selected subtitle is valid
      const targetSubtitle = parsedSubtitles[currentSubtitleIndex];
      if (!targetSubtitle || 
          typeof targetSubtitle.start !== 'number' ||
          typeof targetSubtitle.end !== 'number') {
        console.warn('[WARN] Current subtitle data invalid, cannot enable looping');
        setStatusMessage('Cannot enable looping: invalid subtitle data');
        setTimeout(() => setStatusMessage(''), 3000);
        return;
      }
      
      // 4. Check if current subtitle duration is reasonable
      const duration = (targetSubtitle.end - targetSubtitle.start) / 1000; // Convert to seconds
      if (duration <= 0 || duration > 30) {
        console.warn(`[WARN] Current subtitle duration abnormal (${duration.toFixed(1)}s), but still enabling loop`);
      }
      
      // Notify user that looping is enabled
      setStatusMessage(`Subtitle loop enabled: #${currentSubtitleIndex + 1}`);
      setTimeout(() => setStatusMessage(''), 3000);
      
      // All checks passed, enable looping
      setIsLoopingSubtitle(true);
      
      // Remember user's choice
      try {
        localStorage.setItem('subtitle-loop-enabled', 'true');
      } catch (e) {
        console.error('[ERROR] Failed to save subtitle loop setting:', e);
      }
      
    } catch (err) {
      console.error('[ERROR] Failed to toggle subtitle loop state:', err);
      setStatusMessage('Failed to toggle subtitle loop, please try again');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  return {
    goToPreviousSubtitle,
    goToNextSubtitle,
    toggleSubtitleLoop
  };
};

export default SubtitleController; 