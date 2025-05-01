import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

function PlayerPanel({ currentVideo }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    
    // 清理函数
    const cleanup = () => {
      if (hlsRef.current) {
        console.log("销毁前一个HLS实例");
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      if (video) {
        console.log("清理视频标签");
        video.pause();
        video.src = "";
        video.load();
      }
    };
    
    // 如果没有视频，执行清理
    if (!currentVideo?.url) {
      cleanup();
      return cleanup;
    }
    
    // 先清理之前的实例
    cleanup();
    
    // 播放新视频
    const playVideo = () => {
      try {
        console.log("加载视频URL:", currentVideo.url);
        
        if (currentVideo.url.includes('.m3u8')) {
          // 使用HLS.js播放m3u8
          if (Hls.isSupported()) {
            console.log("使用HLS.js播放");
            
            const hls = new Hls();
            hlsRef.current = hls;
            
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
              console.log("HLS: 媒体已连接");
            });
            
            hls.on(Hls.Events.MANIFEST_LOADED, () => {
              console.log("HLS: 清单已加载");
            });
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              console.log("HLS: 清单已解析");
              video.play().catch(e => {
                console.error("播放失败:", e);
                // 尝试静音播放（绕过某些自动播放限制）
                video.muted = true;
                video.play();
              });
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
              console.warn("HLS错误:", event, data);
              if (data.fatal) {
                switch(data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log("网络错误，尝试恢复");
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log("媒体错误，尝试恢复");
                    hls.recoverMediaError();
                    break;
                  default:
                    cleanup();
                    break;
                }
              }
            });
            
            // 开始加载
            hls.loadSource(currentVideo.url);
            hls.attachMedia(video);
          } 
          // Safari 原生支持HLS
          else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            console.log("使用浏览器原生HLS支持");
            video.src = currentVideo.url;
            video.play();
          } 
          // 不支持HLS的情况
          else {
            console.error("此浏览器不支持HLS");
          }
        } 
        // 普通视频
        else {
          console.log("加载普通视频");
          video.src = currentVideo.url;
          video.load();
          video.play();
        }
      } catch (err) {
        console.error("视频加载出错:", err);
      }
    };
    
    // 立即播放视频
    playVideo();
    
    // 清理函数
    return cleanup;
  }, [currentVideo]);

  return (
    <div className="flex-1 bg-white rounded-2xl shadow-md p-6 flex flex-col items-center justify-center">
      {currentVideo ? (
        <>
          <h2 className="text-xl font-semibold mb-4 w-full text-center truncate">
            {currentVideo.name}
          </h2>
          <div className="w-full max-w-4xl mx-auto">
            <video 
              ref={videoRef}
              className="w-full h-auto rounded-lg bg-gray-900"
              controls
              autoPlay
              playsInline
            />
          </div>
        </>
      ) : (
        <div className="text-gray-400 text-lg">请点击视频文件进行播放</div>
      )}
    </div>
  );
}

export default PlayerPanel; 