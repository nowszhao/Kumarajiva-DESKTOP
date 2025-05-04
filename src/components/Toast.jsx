import { useEffect } from 'react';

/**
 * Toast 组件（DaisyUI 风格）
 * @param {string} message - 显示的消息内容
 * @param {string} type - 类型: 'info' | 'success' | 'error' | 'warning'
 * @param {number} duration - 自动关闭时间（毫秒），默认2000
 * @param {function} onClose - 关闭回调
 */
export default function Toast({ message, type = 'info', duration = 2000, onClose }) {
  useEffect(() => {
    if (!duration) return;
    const timer = setTimeout(() => {
      onClose?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  let colorClass = 'alert-info';
  if (type === 'success') colorClass = 'alert-success';
  else if (type === 'error') colorClass = 'alert-error';
  else if (type === 'warning') colorClass = 'alert-warning';

  return (
    <div className={`toast toast-top toast-end z-[9999] fixed right-4 top-4`}>
      <div className={`alert ${colorClass} shadow-lg px-4 py-2 flex items-center`}>
        <span className="flex-1">{message}</span>
        <button className="btn btn-xs btn-ghost ml-2" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
