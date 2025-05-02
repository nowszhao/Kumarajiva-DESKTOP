# Kumarajiva Desktop

阿里云盘视频播放器桌面应用，基于 React, Electron, 和 DaisyUI 构建。

## 功能特点

- 阿里云盘授权登录
- 文件浏览和搜索
- 视频播放 (支持HLS m3u8格式)
- 字幕支持 (支持ASS格式字幕)
  - 支持从网盘选择字幕文件
  - 支持自动匹配同名字幕文件
  - 支持字幕拖拽调整位置
  - 支持触摸屏拖拽
- 美观的用户界面

## 使用说明

### 字幕功能
1. 播放视频时，应用会自动查找同名的ASS字幕文件
2. 也可以手动点击字幕文件加载
3. 字幕显示在视频播放器上方，可以通过拖拽调整位置
4. 可以通过播放器下方的控制栏移除字幕

## 开发

```bash
# 安装依赖
npm install

# 运行开发环境
npm run electron:dev

# 构建应用
npm run electron:build

# 预览构建后的应用
npm run electron:preview
```

## 技术栈

- React
- Electron
- TailwindCSS
- DaisyUI
- HLS.js 