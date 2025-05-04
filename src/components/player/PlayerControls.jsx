import React from 'react';

const PlayerControls = ({
  subtitleContent,
  isLoopingSubtitle,
  subtitleLoopCount,
  currentLoopingSubtitleIndex,
  currentSubtitleIndex,
  parsedSubtitles,
  isPaused,
  togglePlayPause,
  goToPreviousSubtitle,
  goToNextSubtitle,
  toggleSubtitleLoop,
  toggleSubtitleBlur,
  isSubtitleBlurred,
  requestFullscreen
}) => {
  return (
    <div className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 text-white text-xs z-20 rounded-md flex items-center">
      {/* Subtitle control buttons - only show when there's valid subtitle content */}
      {subtitleContent && (
        <>
          <div className="flex items-center mr-3">
            {/* Simple button instead of standard checkbox, avoiding complex event handling */}
            <button 
              className={`subtitle-loop-btn px-2 py-1 rounded text-xs ${isLoopingSubtitle ? 'bg-yellow-500' : 'bg-gray-700'}`}
              onClick={toggleSubtitleLoop}
              title="Loop subtitle playback"
            >
              Loop: {isLoopingSubtitle ? `ON #${currentLoopingSubtitleIndex + 1} (${subtitleLoopCount}x${
                subtitleLoopCount >= 10 ? ' 0.5x' : 
                subtitleLoopCount >= 5 ? ' 0.75x' : ''
              })` : 'OFF'}
            </button>
          </div>
          
          <div className="subtitle-controls flex items-center space-x-2 mr-3">
            <button
              onClick={goToPreviousSubtitle}
              title="Previous subtitle (Ctrl+B)"
              className="flex flex-col items-center"
            >
              <span>⏮</span>
            </button>
            
            <button
              onClick={togglePlayPause}
              title={isPaused ? "Play" : "Pause"}
            >
              {isPaused ? "▶" : "⏸"}
            </button>
            
            <button
              onClick={goToNextSubtitle}
              title="Next subtitle (Ctrl+N)"
              className="flex flex-col items-center"
            >
              <span>⏭</span>
            </button>
            
            <button
              onClick={toggleSubtitleBlur}
              className={`${isSubtitleBlurred ? 'bg-blue-500' : 'bg-gray-700'} px-2 py-0.5 rounded`}
              title="Blur subtitles"
            >
              Blur: {isSubtitleBlurred ? 'ON' : 'OFF'}
            </button>
          </div>
          
          {/* Current subtitle indicator */}
          <div className="subtitle-indicator mr-3 px-2 py-0.5 bg-gray-700 rounded text-xs">
            Subtitle: {currentSubtitleIndex >= 0 ? currentSubtitleIndex + 1 : "-"}/
            {parsedSubtitles && Array.isArray(parsedSubtitles) ? parsedSubtitles.length : 0}
          </div>
        </>
      )}
      
      {/* Video control buttons */}
      <button
        className="ml-1 px-1 bg-blue-500 rounded hover:bg-blue-600"
        onClick={requestFullscreen}
        title="Fullscreen playback"
      >
        Fullscreen
      </button>
    </div>
  );
};

export default PlayerControls; 