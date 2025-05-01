window.addEventListener('DOMContentLoaded', () => {
  // 阿里云盘 API 配置
  const CLIENT_ID = '717cbc119af349399f525555efb434e1';
  const CLIENT_SECRET = '0743bd65f7384d5c878f564de7d7276a';
  const API_BASE = 'https://openapi.alipan.com';

  // DOM 元素
  const authSection = document.getElementById('auth-section');
  const loggedInContainer = document.getElementById('logged-in-container');
  const searchSection = document.getElementById('search-section');
  const searchInput = document.getElementById('searchInput');
  const fileListSection = document.getElementById('file-list-section');
  const video = document.getElementById('video');
  const playerContainer = document.getElementById('player-container');

  // 状态
  let accessToken = null;
  let driveId = null;
  let currentFolderId = 'root';
  let folderStack = [];

  // 初始化
  showLoginButton();
  showPlayerPlaceholder();

  // 显示登录按钮（未登录）
  function showLoginButton() {
    authSection.innerHTML = `<button class="btn btn-primary mt-24" id="loginAliyun">登录阿里云盘</button>`;
    authSection.classList.remove('hidden');
    loggedInContainer.classList.add('hidden');
    document.getElementById('loginAliyun').onclick = startAliyunLogin;
  }

  // 展示二维码（扫码中）
  function showQRCode(qrCodeUrl) {
    authSection.innerHTML = `
      <img src="${qrCodeUrl}" alt="二维码" class="w-64 h-64 mx-auto" />
      <div class="text-center text-orange-500 mt-2">请使用阿里云盘 APP 扫码</div>
    `;
    authSection.classList.remove('hidden');
    loggedInContainer.classList.add('hidden');
  }

  // 登录成功后显示文件管理（已登录）
  function showFileManager() {
    authSection.classList.add('hidden');
    loggedInContainer.classList.remove('hidden');
  }

  // 开始阿里云盘登录流程
  async function startAliyunLogin() {
    authSection.innerHTML = '<span class="loading loading-spinner loading-lg"></span>';
    authSection.classList.remove('hidden');
    loggedInContainer.classList.add('hidden');
    try {
      const res = await axios.post(`${API_BASE}/oauth/authorize/qrcode`, {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scopes: [
          'user:base',
          'file:all:read',
          'file:all:write',
          'album:shared:read',
          'file:share:write'
        ],
        width: 300,
        height: 300
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      const { qrCodeUrl, sid } = res.data;
      showQRCode(qrCodeUrl);
      pollQRCodeStatus(sid);
    } catch (e) {
      authSection.innerHTML = '<div class="text-error">二维码获取失败，请重试</div>';
    }
  }

  // 轮询二维码状态
  function pollQRCodeStatus(sid) {
    let timer = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE}/oauth/qrcode/${sid}/status`);
        if (res.data.status === 'LoginSuccess') {
          clearInterval(timer);
          getAccessToken(res.data.authCode);
        }
      } catch (e) {}
    }, 1500);
  }

  // 用 authCode 换 access_token
  async function getAccessToken(authCode) {
    authSection.innerHTML = '<span class="loading loading-spinner loading-lg"></span>';
    try {
      const res = await axios.post(`${API_BASE}/oauth/access_token`, {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: authCode
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      accessToken = res.data.access_token;
      getDriveInfo();
    } catch (e) {
      authSection.innerHTML = '<div class="text-error">授权失败，请重试</div>';
    }
  }

  // 获取 drive_id
  async function getDriveInfo() {
    try {
      const res = await axios.post(`${API_BASE}/adrive/v1.0/user/getDriveInfo`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      driveId = res.data.resource_drive_id || res.data.default_drive_id;
      authSection.innerHTML = `<div class="text-success text-center">登录成功，欢迎 ${res.data.nick_name || res.data.user_name}</div>`;
      setTimeout(() => {
        showFileManager();
        loadFileList('root');
      }, 1000);
    } catch (e) {
      authSection.innerHTML = '<div class="text-error">获取用户信息失败</div>';
    }
  }

  // 加载文件列表
  async function loadFileList(parent_file_id = 'root') {
    fileListSection.innerHTML = '<span class="loading loading-spinner loading-lg mx-auto mt-24"></span>';
    try {
      const res = await axios.post(`${API_BASE}/adrive/v1.0/openFile/list`, {
        drive_id: driveId,
        parent_file_id
      }, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      renderFileList(res.data.items, parent_file_id);
      currentFolderId = parent_file_id;
    } catch (e) {
      fileListSection.innerHTML = '<div class="text-error">文件加载失败</div>';
    }
  }

  // 渲染文件列表
  function renderFileList(items, parent_file_id) {
    let html = '';
    if (parent_file_id !== 'root') {
      html += `<div class="flex items-center cursor-pointer mb-2" id="backFolder"><svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>返回上级</div>`;
    }
    html += '<ul class="menu w-full">';
    items.forEach(item => {
      if (item.type === 'folder') {
        html += `<li><a class="flex items-center folder-item hover:bg-blue-50" data-id="${item.file_id}"><svg class="w-5 h-5 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H2v16h20V6H12l-2-2z"/></svg>${item.name}</a></li>`;
      } else if (item.category === 'video' || (item.mime_type && item.mime_type.startsWith('video'))) {
        html += `<li><a class="flex items-center video-item hover:bg-green-50" data-id="${item.file_id}" data-name="${item.name}"><svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>${item.name}${item.video_media_metadata && item.video_media_metadata.duration ? `<span class='ml-2 text-xs text-gray-400'>${formatDuration(item.video_media_metadata.duration)}</span>` : ''}</a></li>`;
      } else {
        html += `<li><a class="flex items-center"><svg class="w-5 h-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>${item.name}</a></li>`;
      }
    });
    html += '</ul>';
    fileListSection.innerHTML = html;

    // 文件夹点击
    fileListSection.querySelectorAll('.folder-item').forEach(el => {
      el.onclick = () => {
        folderStack.push(currentFolderId);
        loadFileList(el.getAttribute('data-id'));
      };
    });
    // 返回上级
    const backBtn = document.getElementById('backFolder');
    if (backBtn) {
      backBtn.onclick = () => {
        const prev = folderStack.pop() || 'root';
        loadFileList(prev);
      };
    }
    // 视频点击
    fileListSection.querySelectorAll('.video-item').forEach(el => {
      el.onclick = () => {
        playAliyunVideo(el.getAttribute('data-id'));
      };
    });
  }

  // 搜索功能
  searchInput && (searchInput.onkeydown = function(e) {
    if (e.key === 'Enter') {
      doSearch(searchInput.value.trim());
    }
  });

  async function doSearch(query) {
    if (!query) return;
    fileListSection.innerHTML = '<span class="loading loading-spinner loading-lg mx-auto mt-24"></span>';
    try {
      const res = await axios.post(`${API_BASE}/adrive/v1.0/openFile/search`, {
        limit: 50,
        query: `name match \"${query}\"`,
        drive_id: driveId
      }, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      renderFileList(res.data.items, 'search');
    } catch (e) {
      fileListSection.innerHTML = '<div class="text-error">搜索失败</div>';
    }
  }

  // 获取视频播放地址并播放
  async function playAliyunVideo(file_id) {
    try {
      const res = await axios.post(`${API_BASE}/adrive/v1.0/openFile/getVideoPreviewPlayInfo`, {
        drive_id: driveId,
        file_id,
        category: 'live_transcoding'
      }, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      // 取清晰度优先顺序：SD > LD
      let m3u8Url = '';
      const list = res.data.video_preview_play_info.live_transcoding_task_list || [];
      const sd = list.find(x => x.template_id === 'SD' && x.url);
      const ld = list.find(x => x.template_id === 'LD' && x.url);
      m3u8Url = (sd && sd.url) || (ld && ld.url) || '';
      if (m3u8Url) {
        playM3U8(m3u8Url);
        hidePlayerPlaceholder();
      } else {
        alert('未获取到可用的播放地址');
      }
    } catch (e) {
      alert('获取播放地址失败');
    }
  }

  // m3u8 播放逻辑
  function playM3U8(url) {
    if (window.hls) {
      window.hls.destroy();
    }
    if (Hls.isSupported()) {
      window.hls = new Hls();
      window.hls.loadSource(url);
      window.hls.attachMedia(video);
      window.hls.on(Hls.Events.ERROR, function(event, data) {
        if (data.fatal) {
          alert('播放出错：' + data.type + '\n' + data.details);
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else {
      alert('当前环境不支持 m3u8 播放');
    }
    hidePlayerPlaceholder();
  }

  // 播放器区未播放时的提示
  function showPlayerPlaceholder() {
    if (!document.getElementById('player-placeholder')) {
      const placeholder = document.createElement('div');
      placeholder.id = 'player-placeholder';
      placeholder.innerText = '请点击视频文件进行播放';
      playerContainer.appendChild(placeholder);
    }
    video.style.visibility = 'hidden';
  }
  function hidePlayerPlaceholder() {
    const placeholder = document.getElementById('player-placeholder');
    if (placeholder) placeholder.remove();
    video.style.visibility = 'visible';
  }

  // 初始化时隐藏视频，显示提示
  video.addEventListener('loadeddata', hidePlayerPlaceholder);
  video.addEventListener('emptied', showPlayerPlaceholder);

  // 工具：格式化时长
  function formatDuration(seconds) {
    seconds = Math.floor(Number(seconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${(h > 0 && m < 10) ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
});
