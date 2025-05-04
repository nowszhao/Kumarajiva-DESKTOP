/**
 * 增强的字幕解析工具
 * 支持ASS和SRT格式，包含多种兼容模式
 */

// 增强版字幕解析函数
export const parseAssSubtitles = (content) => {
  if (!content) return [];
  
  try {
    console.log("开始解析字幕文件...");
    console.log("字幕文件长度:", content.length);
    console.log("字幕文件前100个字符:", content.substring(0, 100).replace(/\n/g, '\\n'));
    
    // 添加更多内容分析
    console.log("字幕格式特征检测:");
    console.log("- 含[Script Info]:", content.includes('[Script Info]'));
    console.log("- 含Dialogue:", content.includes('Dialogue:'));
    console.log("- 含-->:", content.includes('-->'));
    console.log("- 含WEBVTT:", content.includes('WEBVTT'));
    console.log("- 含RARBG:", content.includes('RARBG'));
    console.log("- 含Silicon.Valley.:", content.includes('Silicon.Valley.'));
    
    // 首先检查是否是时间范围格式的字幕 (00:00:33 - 00:00:34)
    if (content.match(/\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}/)) {
      console.log("检测到时间范围格式的字幕，尝试直接解析");
      const timeRangeSubtitles = parseTimeRangeFormat(content);
      if (timeRangeSubtitles.length > 0) {
        console.log(`时间范围解析成功，找到 ${timeRangeSubtitles.length} 条字幕`);
        return timeRangeSubtitles;
      }
    }
    
    // 检查是否是特殊格式的RARBG字幕
    if (content.includes('-RARBG.ass') || 
        content.includes('Silicon.Valley.') || 
        (content.includes('00:00:') && content.includes('Language: Chinese'))) {
      console.log("检测到RARBG特殊格式，使用专用解析器");
      return parseRarbgSubtitle(content);
    }
    
    const lines = content.split('\n');
    console.log("总行数:", lines.length);
    
    // 显示前10行内容用于分析
    console.log("前10行内容:");
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      console.log(`行${i+1}: ${lines[i].substring(0, 100)}`);
    }
    
    const events = [];
    
    // 检查文件头部以确定格式
    let fileFormat = detectSubtitleFormat(content, lines);
    console.log("检测到字幕格式:", fileFormat);
    
    // 根据不同格式调用不同的解析函数
    let results = [];
    switch (fileFormat) {
      case 'ass':
        results = parseAssFormat(lines);
        console.log(`ASS解析结果: ${results.length}条字幕`);
        return results;
      case 'srt':
        results = parseSrtFormat(lines, content);
        console.log(`SRT解析结果: ${results.length}条字幕`);
        return results;
      case 'vtt':
        results = parseVttFormat(lines);
        console.log(`VTT解析结果: ${results.length}条字幕`);
        return results;
      case 'generic':
        results = parseGenericFormat(lines, content);
        console.log(`通用格式解析结果: ${results.length}条字幕`);
        return results;
      default:
        // 尝试所有格式
        console.log("未能确定字幕格式，尝试所有解析方法");
        
        // 先尝试RARBG特殊格式
        results = parseRarbgSubtitle(content);
        console.log(`尝试RARBG格式解析结果: ${results.length}条字幕`);
        if (results.length > 0) return results;
        
        results = parseAssFormat(lines);
        console.log(`尝试ASS格式解析结果: ${results.length}条字幕`);
        if (results.length > 0) return results;
        
        results = parseSrtFormat(lines, content);
        console.log(`尝试SRT格式解析结果: ${results.length}条字幕`);
        if (results.length > 0) return results;
        
        results = parseVttFormat(lines);
        console.log(`尝试VTT格式解析结果: ${results.length}条字幕`);
        if (results.length > 0) return results;
        
        results = parseGenericFormat(lines, content);
        console.log(`尝试通用格式解析结果: ${results.length}条字幕`);
        return results;
    }
  } catch (e) {
    console.error('字幕解析失败:', e);
    return [{
      start: 0,
      end: 10000,
      text: '⚠️ 字幕解析出错: ' + e.message
    }];
  }
};

// 检测字幕格式
function detectSubtitleFormat(content, lines) {
  console.log("检测字幕格式中...");
  
  // 检查是否是RARBG标准ASS格式 (基于用户提供的字幕样例)
  if (content.includes('-RARBG.ass') || 
      content.includes('Language: Chinese') || 
      content.includes('PlayResX:') ||
      content.includes('Silicon.Valley.')) {
    console.log("检测到RARBG或特殊格式ASS字幕");
    return 'ass';
  }
  
  // 检查ASS格式 - 扩展检测条件
  if (content.includes('[Script Info]') || 
      content.includes('Dialogue:') || 
      content.includes('[Events]') ||
      content.includes('Style:')) {
    console.log("检测到ASS特征标记");
    return 'ass';
  }
  
  // 检查SRT格式 - 匹配更多SRT时间格式变体
  const srtTimePatterns = [
    /\d+:\d+:\d+,\d+\s+-->\s+\d+:\d+:\d+,\d+/, // 标准SRT格式 00:00:00,000 --> 00:00:00,000
    /\d+:\d+:\d+\.\d+\s+-->\s+\d+:\d+:\d+\.\d+/, // 使用点而非逗号的变体
    /\d+:\d+:\d+\s+-->\s+\d+:\d+:\d+/ // 无毫秒的简化格式
  ];
  
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    const line = lines[i].trim();
    for (const pattern of srtTimePatterns) {
      if (pattern.test(line)) {
        console.log("检测到SRT时间戳特征，行:", i);
        return 'srt';
      }
    }
  }
  
  // 检查WebVTT格式
  if (content.includes('WEBVTT')) {
    console.log("检测到WEBVTT标记");
    return 'vtt';
  }
  
  // 尝试基于序号和时间戳的启发式检测SRT
  // 查找序号+时间戳的模式
  let hasNumbering = false;
  let hasTimeStamp = false;
  
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    if (/^\d+$/.test(lines[i].trim())) {
      hasNumbering = true;
    }
    if (i > 0 && hasNumbering && srtTimePatterns.some(pattern => pattern.test(lines[i].trim()))) {
      hasTimeStamp = true;
      break;
    }
  }
  
  if (hasNumbering && hasTimeStamp) {
    console.log("通过序号+时间戳模式检测到SRT格式");
    return 'srt';
  }
  
  // 附加检测：查找时间戳格式的字幕
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    // 匹配h:mm:ss.ms格式的时间戳
    if (/\d+:\d+:\d+\.\d+/.test(lines[i])) {
      console.log("发现时间戳格式, 可能是ASS变体");
      return 'ass';
    }
  }
  
  // 对于RARBG特殊格式 - 查找特定标记
  if (content.includes('00:00:') && (
      content.includes('RARBG') || 
      content.match(/\d+:\d+:\d+\s+-\s+\d+:\d+:\d+/) // 时间范围格式 00:00:00 - 00:00:00
  )) {
    console.log("检测到RARBG特殊时间格式");
    return 'ass';
  }
  
  // 查找典型的中英文字幕行
  if (lines.some(l => /[\u4e00-\u9fa5].*[a-zA-Z]/.test(l) || 
                    /[a-zA-Z].*[\u4e00-\u9fa5]/.test(l))) {
    console.log("检测到中英文混合字幕行，使用通用格式");
    return 'generic';
  }
  
  console.log("无法确定字幕格式，标记为未知");
  return 'unknown';
}

// 解析ASS格式字幕
function parseAssFormat(lines) {
  const events = [];
  let eventsSection = false;
  let formatLine = '';
  let formatParts = [];
  let dialogueCount = 0;
  let formatFound = false;
  
  // 先检查是否有Events和Dialogue部分
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine === '[Events]') {
      console.log("找到[Events]部分, 行号:", i);
      eventsSection = true;
    }
    if (trimmedLine.startsWith('Dialogue:')) {
      dialogueCount++;
    }
  }
  
  console.log(`初步扫描: 找到${dialogueCount}行Dialogue行`);
  
  // 如果没有找到Events部分但有Dialogue行，视为特殊ASS格式，强制设置事件部分标志
  if (!eventsSection && dialogueCount > 0) {
    console.log("没有[Events]部分但发现Dialogue行，使用兼容模式");
    eventsSection = true;
  }
  
  // 尝试寻找Format行并处理对话行
  dialogueCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    
    // 记录关键部分
    if (trimmedLine === '[Events]') {
      eventsSection = true;
      console.log("找到[Events]部分, 行号:", i);
      continue;
    }
    
    // 查找Format行
    if (eventsSection && trimmedLine.startsWith('Format:')) {
      formatLine = trimmedLine;
      formatParts = formatLine.substring(7).split(',').map(part => part.trim());
      formatFound = true;
      console.log("找到Format行:", formatLine);
      console.log("解析后的格式部分:", formatParts);
      continue;
    }
    
    // 处理对话行
    if ((eventsSection || dialogueCount > 0) && trimmedLine.startsWith('Dialogue:')) {
      dialogueCount++;
      
      try {
        // 尝试多种分割方法
        let dialogueParts;
        let dialogueText = '';
        let startTime = '0:00:00.00';
        let endTime = '0:00:05.00';
        
        // 标准ASS格式解析
        if (formatFound) {
          // 按照标准格式解析
          const firstColon = trimmedLine.indexOf(':');
          dialogueParts = trimmedLine.substring(firstColon + 1).split(',');
          
          // 确定文本部分的起始位置
          const textIndex = formatParts.findIndex(part => part.toLowerCase() === 'text');
          const textPosition = textIndex !== -1 ? textIndex : Math.min(9, dialogueParts.length - 1);
          
          // 获取时间信息
          const startIndex = formatParts.findIndex(part => part.toLowerCase() === 'start');
          const endIndex = formatParts.findIndex(part => part.toLowerCase() === 'end');
          
          // 提取时间和文本
          if (startIndex !== -1 && startIndex < dialogueParts.length) {
            startTime = dialogueParts[startIndex].trim();
          } else if (dialogueParts.length > 1) {
            startTime = dialogueParts[1].trim();
          }
          
          if (endIndex !== -1 && endIndex < dialogueParts.length) {
            endTime = dialogueParts[endIndex].trim();
          } else if (dialogueParts.length > 2) {
            endTime = dialogueParts[2].trim();
          }
          
          // 提取文本
          if (textPosition < dialogueParts.length) {
            dialogueText = dialogueParts.slice(textPosition).join(',').trim();
          }
        } else {
          // 如果没有Format行，尝试启发式解析
          console.log("无Format行，使用启发式解析, 行:", i);
          
          // 最简单的方法：按逗号分割并假设固定位置
          const lineWithoutPrefix = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim();
          dialogueParts = lineWithoutPrefix.split(',');
          
          // 显示解析细节以便调试
          console.log(`解析行 #${i}: 分割后得到${dialogueParts.length}部分`);
          
          // 假设第1个和第2个字段是开始和结束时间 (索引从0开始)
          if (dialogueParts.length > 2) {
            startTime = dialogueParts[1].trim();
            endTime = dialogueParts[2].trim();
            
            console.log(`提取时间: 开始=${startTime}, 结束=${endTime}`);
            
            // 假设第9个字段开始是文本 (索引从0开始，所以是第10个元素)
            if (dialogueParts.length > 9) {
              dialogueText = dialogueParts.slice(9).join(',').trim();
            } else {
              // 否则假设最后一个字段是文本
              dialogueText = dialogueParts[dialogueParts.length - 1].trim();
            }
            
            console.log(`提取文本: "${dialogueText.substring(0, 30)}${dialogueText.length > 30 ? '...' : ''}"`);
          } else {
            // 如果分割后部分太少，可能格式异常，使用正则表达式提取时间
            const timeMatch = trimmedLine.match(/(\d+:\d+:\d+\.\d+),\s*(\d+:\d+:\d+\.\d+)/);
            if (timeMatch) {
              startTime = timeMatch[1];
              endTime = timeMatch[2];
              
              // 提取文本部分 - 查找第二个时间后的所有内容
              const textStart = trimmedLine.indexOf(endTime) + endTime.length;
              if (textStart < trimmedLine.length) {
                dialogueText = trimmedLine.substring(textStart).trim();
                // 如果文本以逗号开头，去掉逗号
                if (dialogueText.startsWith(',')) {
                  dialogueText = dialogueText.substring(1).trim();
                }
              }
            }
          }
        }
        
        // 转换ASS时间格式为毫秒
        const timeToMs = (timeStr) => {
          try {
            const [h, m, s] = timeStr.split(':');
            return Math.floor((parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)) * 1000);
          } catch (e) {
            console.warn('时间格式解析失败:', timeStr, e);
            return 0; // 解析失败则返回0
          }
        };
        
        // 处理字幕样式标记，将其转换为简单HTML
        const processStyleTags = (text) => {
          if (!text) return '';
          
          // 移除ASS特有的样式标记如{\\an8}等
          const processed = text.replace(/{[^}]*}/g, '')
            // 替换换行符为HTML换行
            .replace(/\\N/g, '<br>').replace(/\\n/g, '<br>')
            // 移除无法显示的控制字符
            .replace(/[\x00-\x1F\x7F]/g, '');
            
          return processed;
        };
        
        // 创建字幕条目
        const startMs = timeToMs(startTime);
        const endMs = timeToMs(endTime);
        
        // 过滤无效或过短的字幕
        const minDuration = 50; // 最小持续时间50毫秒
        if (
          typeof startMs === 'number' && 
          typeof endMs === 'number' && 
          !isNaN(startMs) && 
          !isNaN(endMs) && 
          startMs < endMs && 
          (endMs - startMs) >= minDuration && 
          dialogueText
        ) {
          events.push({
            start: startMs,
            end: endMs,
            text: processStyleTags(dialogueText)
          });
        } else {
          console.warn(`行${i}: 跳过无效字幕: ${startTime} -> ${endTime} "${dialogueText}"`, {
            startMs, endMs, duration: endMs - startMs, hasText: !!dialogueText 
          });
        }
      } catch (e) {
        console.error(`解析行${i}出错:`, e, `内容: "${trimmedLine}"`);
      }
    }
  }
  
  // 特殊情况：如果没有解析到任何字幕但有对话行，尝试更宽松的解析
  if (events.length === 0 && dialogueCount > 0) {
    console.log("标准解析失败，尝试宽松的解析方法...");
    
    // 尝试用一种非常宽松的方式再次解析
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('Dialogue:')) {
        try {
          // 使用正则表达式直接提取时间
          const timeMatch = line.match(/(\d+:\d+:\d+\.\d+)/g);
          if (timeMatch && timeMatch.length >= 2) {
            const startTime = timeMatch[0];
            const endTime = timeMatch[1];
            
            // 尝试提取文本 - 假设文本在第二个时间戳之后
            let text = '';
            const secondTimeEnd = line.indexOf(endTime) + endTime.length;
            if (secondTimeEnd < line.length) {
              // 查找文本起始位置 - 找到第二个时间后的第一个非空白字符
              let textStart = secondTimeEnd;
              while (textStart < line.length && (line[textStart] === ',' || line[textStart] === ' ')) {
                textStart++;
              }
              
              if (textStart < line.length) {
                text = line.substring(textStart).trim();
              }
            }
            
            // 如果没有找到文本，尝试提取第二个时间之后的所有内容
            if (!text && timeMatch.length >= 2) {
              const parts = line.split(timeMatch[1]);
              if (parts.length > 1) {
                text = parts[1].trim();
                // 移除可能的前导逗号
                if (text.startsWith(',')) {
                  text = text.substring(1).trim();
                }
              }
            }
            
            if (text) {
              // 转换时间
              const startMs = timeToMs(startTime);
              const endMs = timeToMs(endTime);
              
              // 添加字幕
              if (startMs < endMs && endMs - startMs >= 50) {
                events.push({
                  start: startMs,
                  end: endMs,
                  text: text.replace(/{[^}]*}/g, '').replace(/\\N/g, '<br>').replace(/\\n/g, '<br>')
                });
                console.log(`宽松解析: 添加字幕 ${startTime} -> ${endTime} "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
              }
            }
          }
        } catch (e) {
          console.error(`宽松解析行${i}出错:`, e);
        }
      }
    }
  }
  
  // 辅助函数：转换时间格式为毫秒
  function convertTimeToMs(timeStr) {
    try {
      const [h, m, s] = timeStr.split(':');
      return Math.floor((parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)) * 1000);
    } catch (e) {
      return 0;
    }
  }
  
  // 按开始时间排序
  events.sort((a, b) => a.start - b.start);
  
  console.log(`ASS解析完成，共解析出${events.length}条字幕`);
  return events;
}

// 解析SRT格式字幕 - 增强版
function parseSrtFormat(lines, content) {
  console.log("使用增强版SRT解析器...");
  const events = [];
  let currentIndex = null;
  let currentStart = null;
  let currentEnd = null;
  let currentText = [];
  
  // 支持多种时间格式的转换函数
  const timeToMs = (timeStr) => {
    try {
      // 处理不同的SRT时间格式变体
      if (timeStr.includes(',')) {
        // 标准SRT格式: 00:00:00,000
        const [h, m, s] = timeStr.split(':');
        const [sec, ms] = s.split(',');
        return (parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec)) * 1000 + parseInt(ms);
      } else if (timeStr.includes('.')) {
        // 点分隔的变体: 00:00:00.000
        const [h, m, s] = timeStr.split(':');
        const [sec, ms] = s.split('.');
        return (parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec)) * 1000 + parseInt(ms);
      } else {
        // 无毫秒的简化格式: 00:00:00
        const [h, m, s] = timeStr.split(':');
        return (parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s)) * 1000;
      }
    } catch (e) {
      console.error('SRT时间格式解析错误:', timeStr, e);
      return 0;
    }
  };
  
  // 多种时间行匹配模式
  const timeLinePatterns = [
    /^(\d+:\d+:\d+,\d+)\s+-->\s+(\d+:\d+:\d+,\d+)(.*)$/,   // 标准格式 00:00:00,000 --> 00:00:00,000
    /^(\d+:\d+:\d+\.\d+)\s+-->\s+(\d+:\d+:\d+\.\d+)(.*)$/, // 点分隔格式 00:00:00.000 --> 00:00:00.000
    /^(\d+:\d+:\d+)\s+-->\s+(\d+:\d+:\d+)(.*)$/            // 无毫秒格式 00:00:00 --> 00:00:00
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 空行表示一个字幕条目的结束
    if (line === '') {
      if (currentText.length > 0 && currentStart && currentEnd) {
        // 处理文本内容，确保正确的格式化和换行
        const processedText = currentText
          .join('<br>')
          .replace(/\\N/g, '<br>')
          .replace(/\\n/g, '<br>')
          .replace(/\{[^}]*\}/g, '') // 移除ASS样式标记
          .replace(/<([^\/biu>][^>]*)>/g, '') // 只保留基本格式标签
          .trim();
          
        events.push({
          start: timeToMs(currentStart),
          end: timeToMs(currentEnd),
          text: processedText
        });
        
        // 日志
        if (events.length <= 3 || events.length % 50 === 0) {
          console.log(`解析SRT字幕 #${events.length}:`, {
            index: currentIndex,
            start: currentStart,
            end: currentEnd,
            text: processedText.substring(0, 30) + (processedText.length > 30 ? '...' : '')
          });
        }
      }
      
      currentIndex = null;
      currentStart = null;
      currentEnd = null;
      currentText = [];
      continue;
    }
    
    // 检查是否是索引行（纯数字）
    if (currentIndex === null && /^\d+$/.test(line)) {
      currentIndex = parseInt(line);
      continue;
    }
    
    // 检查是否是时间行，使用多种模式匹配
    if (currentIndex !== null && currentStart === null) {
      let timeMatch = null;
      
      for (const pattern of timeLinePatterns) {
        timeMatch = line.match(pattern);
        if (timeMatch) {
          currentStart = timeMatch[1];
          currentEnd = timeMatch[2];
          break;
        }
      }
      
      if (timeMatch) continue;
    }
    
    // 如果已有索引和时间，则认为是文本行
    if ((currentIndex !== null && currentStart !== null) || (currentText.length > 0 && currentStart !== null)) {
      // 处理HTML标签，保留<br>和简单样式
      const processedLine = line
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ');
      
      currentText.push(processedLine);
    }
  }
  
  // 处理最后一条字幕（如果文件不以空行结束）
  if (currentText.length > 0 && currentStart && currentEnd) {
    // 与前面相同的处理方式
    const processedText = currentText
      .join('<br>')
      .replace(/\\N/g, '<br>')
      .replace(/\\n/g, '<br>')
      .replace(/\{[^}]*\}/g, '')
      .replace(/<([^\/biu>][^>]*)>/g, '')
      .trim();
      
    events.push({
      start: timeToMs(currentStart),
      end: timeToMs(currentEnd),
      text: processedText
    });
  }
  
  // 如果SRT处理失败，尝试替代解析方法
  if (events.length === 0) {
    // 尝试通过简单模式匹配SRT
    console.log("标准SRT解析失败，尝试简单模式解析...");
    let simpleIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 跳过空行
      if (line === '') continue;
      
      // 查找时间行
      let timeMatch = null;
      for (const pattern of timeLinePatterns) {
        timeMatch = line.match(pattern);
        if (timeMatch) break;
      }
      
      if (timeMatch) {
        const start = timeMatch[1];
        const end = timeMatch[2];
        
        // 收集此时间行之后的文本行，直到下一个数字行或时间行
        let subtitleText = [];
        let j = i + 1;
        
        while (j < lines.length) {
          const nextLine = lines[j].trim();
          
          // 如果是空行、数字行或时间行，结束收集
          if (nextLine === '' || 
              /^\d+$/.test(nextLine) || 
              timeLinePatterns.some(pattern => pattern.test(nextLine))) {
            break;
          }
          
          subtitleText.push(nextLine);
          j++;
        }
        
        // 如果收集到文本，创建字幕条目
        if (subtitleText.length > 0) {
          // 与前面相同的处理方式
          const processedText = subtitleText
            .join('<br>')
            .replace(/\\N/g, '<br>')
            .replace(/\\n/g, '<br>')
            .replace(/\{[^}]*\}/g, '')
            .replace(/<([^\/biu>][^>]*)>/g, '')
            .trim();
            
          events.push({
            start: timeToMs(start),
            end: timeToMs(end),
            text: processedText
          });
          
          simpleIndex++;
        }
      }
    }
    
    if (simpleIndex > 0) {
      console.log(`简单模式解析成功，找到 ${simpleIndex} 条字幕`);
    }
  }
  
  return events;
}

// 解析WebVTT格式字幕
function parseVttFormat(lines) {
  console.log("解析WebVTT格式字幕");
  const events = [];
  let currentStart = null;
  let currentEnd = null;
  let currentText = [];
  
  // 跳过WEBVTT头部
  let startIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'WEBVTT') {
      startIndex = i + 1;
      break;
    }
  }
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 检查是否是时间行 (00:00:00.000 --> 00:00:00.000)
    const timeMatch = line.match(/(\d+:\d+:\d+\.\d+)\s+-->\s+(\d+:\d+:\d+\.\d+)/);
    if (timeMatch) {
      // 如果已有时间和文本，保存之前的字幕
      if (currentStart && currentText.length > 0) {
        const timeToMs = (timeStr) => {
          const [h, m, s] = timeStr.split(':');
          return (parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)) * 1000;
        };
        
        events.push({
          start: timeToMs(currentStart),
          end: timeToMs(currentEnd),
          text: currentText.join('<br>')
        });
        
        currentText = [];
      }
      
      currentStart = timeMatch[1];
      currentEnd = timeMatch[2];
      continue;
    }
    
    // 如果有时间，且不是空行，认为是文本
    if (currentStart && line !== '') {
      currentText.push(line);
    }
  }
  
  // 添加最后一条字幕
  if (currentStart && currentText.length > 0) {
    const timeToMs = (timeStr) => {
      const [h, m, s] = timeStr.split(':');
      return (parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)) * 1000;
    };
    
    events.push({
      start: timeToMs(currentStart),
      end: timeToMs(currentEnd),
      text: currentText.join('<br>')
    });
  }
  
  return events;
}

// 通用字幕解析，用于当特定格式识别失败时
function parseGenericFormat(lines, content) {
  console.log("使用通用格式解析模式...");
  const events = [];
  
  // 尝试使用正则表达式匹配对话行
  if (content.includes('Dialogue:')) {
    for (const line of lines) {
      if (line.includes('Dialogue:')) {
        try {
          // 尝试匹配时间字段，格式通常是 h:mm:ss.cc
          const timeRegex = /(\d+:\d+:\d+\.\d+)/g;
          const times = line.match(timeRegex);
          
          if (times && times.length >= 2) {
            const startTime = times[0];
            const endTime = times[1];
            
            // 尝试提取文本部分 - 找到最后一个逗号后的所有内容
            const lastCommaIndex = line.lastIndexOf(',');
            let text = '';
            if (lastCommaIndex !== -1 && lastCommaIndex < line.length - 1) {
              text = line.substring(lastCommaIndex + 1).trim();
            }
            
            // 如果没有文本，尝试使用倒数第二个逗号
            if (!text) {
              const parts = line.split(',');
              if (parts.length > 1) {
                text = parts[parts.length - 1].trim();
              }
            }
            
            // 转换时间
            const timeToMs = (timeStr) => {
              const [h, m, s] = timeStr.split(':');
              return (parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)) * 1000;
            };
            
            events.push({
              start: timeToMs(startTime),
              end: timeToMs(endTime),
              text: text.replace(/\{[^}]*\}/g, '').replace(/\\N/g, '<br>')
            });
          }
        } catch (e) {
          console.error('强力解析失败:', e);
        }
      }
    }
  }
  
  // 如果仍然没有解析出字幕，但文件确实有内容，尝试按行解析
  if (events.length === 0 && content.length > 0) {
    console.log("尝试最后的兼容模式: 每行作为一条字幕");
    
    // 去除可能的BOM和空行
    const cleanLines = lines
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('[') && !line.startsWith('WEBVTT'));
    
    if (cleanLines.length > 0) {
      // 每行作为一条5秒的字幕
      const duration = 5000; // 毫秒
      for (let i = 0; i < cleanLines.length; i++) {
        events.push({
          start: i * duration,
          end: (i + 1) * duration,
          text: cleanLines[i]
        });
      }
      console.log(`兼容模式已创建 ${events.length} 条字幕`);
    } else {
      // 如果连终极兼容模式都失败了，显示警告
      events.push({
        start: 0,
        end: 10000,
        text: '⚠️ 字幕解析失败，但文件有内容。请检查字幕格式是否支持。'
      });
      console.error('字幕解析失败，但文件有内容');
    }
  }
  
  return events;
}

// 专门解析RARBG风格的字幕
function parseRarbgSubtitle(content) {
  console.log("使用RARBG专用解析器...");
  const subtitles = [];
  
  try {
    // 将内容分割成行
    const lines = content.split('\n');
    
    // 匹配时间戳模式 - 多种可能的格式
    const timePatterns = [
      /(\d+:\d+:\d+)\s*-\s*(\d+:\d+:\d+)/, // 00:00:00 - 00:00:00
      /(\d+:\d+:\d+)\s*-->\s*(\d+:\d+:\d+)/, // 00:00:00 --> 00:00:00
      /(\d+:\d+:\d+)[\s\.,]+(\d+:\d+:\d+)/ // 00:00:00, 00:00:00 或其他分隔符
    ];
    
    // 中英文字幕的特征
    const hasChinesePattern = /[\u4e00-\u9fa5]/;
    const hasEnglishPattern = /[a-zA-Z]/;
    
    // 使用时间戳行作为分隔，查找字幕块
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // 查找时间戳行
      let timeMatch = null;
      for (const pattern of timePatterns) {
        timeMatch = line.match(pattern);
        if (timeMatch) break;
      }
      
      if (timeMatch) {
        const startTime = timeMatch[1];
        const endTime = timeMatch[2];
        
        // 转换时间为毫秒
        const timeToMs = (time) => {
          const [h, m, s] = time.split(':').map(Number);
          return (h * 3600 + m * 60 + s) * 1000;
        };
        
        // 寻找下一行或几行作为字幕文本
        let textLines = [];
        let j = i + 1;
        
        // 收集直到下一个时间戳或空行
        while (j < lines.length && 
               lines[j].trim() && 
               !timePatterns.some(p => p.test(lines[j]))) {
          textLines.push(lines[j].trim());
          j++;
        }
        
        // 如果找到文本，创建字幕条目
        if (textLines.length > 0) {
          // 处理中英文字幕 - 可能分为两行
          let chinese = '';
          let english = '';
          
          // 检测中英文分布
          if (textLines.length >= 2) {
            const line1HasChinese = hasChinesePattern.test(textLines[0]);
            const line1HasEnglish = hasEnglishPattern.test(textLines[0]);
            const line2HasChinese = hasChinesePattern.test(textLines[1]);
            const line2HasEnglish = hasEnglishPattern.test(textLines[1]);
            
            // 根据检测结果确定哪行是中文哪行是英文
            if (line1HasChinese && !line1HasEnglish && line2HasEnglish && !line2HasChinese) {
              // 第一行中文，第二行英文
              chinese = textLines[0];
              english = textLines[1];
            } else if (line1HasEnglish && !line1HasChinese && line2HasChinese && !line2HasEnglish) {
              // 第一行英文，第二行中文
              english = textLines[0];
              chinese = textLines[1];
            } else {
              // 混合或其他情况，直接合并
              chinese = textLines.join('<br>');
              english = '';
            }
          } else {
            // 只有一行，直接使用
            chinese = textLines[0];
            english = '';
          }
          
          // 创建格式化的HTML文本
          let text = chinese;
          if (english) {
            text = `${chinese}<br>${english}`;
          }
          
          // 添加字幕
          subtitles.push({
            start: timeToMs(startTime),
            end: timeToMs(endTime),
            text: text
          });
        }
      }
    }
    
    console.log(`RARBG解析器找到${subtitles.length}条字幕`);
    
    // 如果没有找到任何字幕，但内容里有时间戳格式，使用更宽松的匹配
    if (subtitles.length === 0 && (content.includes('00:00:') || content.includes('00:01:'))) {
      console.log("尝试更宽松的RARBG匹配...");
      
      // 正则表达式直接寻找时间戳和文本
      const looseRegex = /(\d+:\d+:\d+).*?(\d+:\d+:\d+)[^\n]*\n(.*?)(?=\n\d+:\d+|\n\s*\n|$)/gs;
      let match;
      
      while ((match = looseRegex.exec(content)) !== null) {
        const startTime = match[1];
        const endTime = match[2];
        const text = match[3].trim().replace(/\n/g, '<br>');
        
        if (text) {
          const timeToMs = (time) => {
            const [h, m, s] = time.split(':').map(Number);
            return (h * 3600 + m * 60 + s) * 1000;
          };
          
          subtitles.push({
            start: timeToMs(startTime),
            end: timeToMs(endTime),
            text: text
          });
        }
      }
      
      console.log(`宽松匹配找到${subtitles.length}条字幕`);
    }
    
    // 如果仍然没有找到字幕，尝试直接提取中英文行
    if (subtitles.length === 0) {
      console.log("尝试直接提取中英文行...");
      const chineseLines = [];
      const englishLines = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // 跳过明显的头部和格式行
        if (trimmed.startsWith('[') || 
            trimmed.includes('RARBG') || 
            trimmed.includes('Format:') ||
            trimmed.includes('Style:') ||
            trimmed.includes('PlayResX:')) {
          continue;
        }
        
        // 判断是中文还是英文
        if (hasChinesePattern.test(trimmed)) {
          chineseLines.push(trimmed);
        } else if (hasEnglishPattern.test(trimmed)) {
          englishLines.push(trimmed);
        }
      }
      
      // 如果中英文行数匹配，认为它们是对应的字幕
      if (chineseLines.length > 0 && chineseLines.length === englishLines.length) {
        console.log(`找到${chineseLines.length}对中英文字幕行`);
        
        // 创建字幕条目，每条持续5秒
        for (let i = 0; i < chineseLines.length; i++) {
          subtitles.push({
            start: i * 5000, // 从0秒开始，每5秒一条
            end: (i + 1) * 5000,
            text: `${chineseLines[i]}<br>${englishLines[i]}`
          });
        }
      } 
      // 如果只有中文或只有英文，也创建字幕
      else if (chineseLines.length > 0 || englishLines.length > 0) {
        const textLines = chineseLines.length > 0 ? chineseLines : englishLines;
        console.log(`找到${textLines.length}行单语字幕`);
        
        for (let i = 0; i < textLines.length; i++) {
          subtitles.push({
            start: i * 5000,
            end: (i + 1) * 5000,
            text: textLines[i]
          });
        }
      }
    }
    
    return subtitles;
  } catch (e) {
    console.error("RARBG字幕解析错误:", e);
    return [];
  }
}

// 专门解析时间范围格式的字幕 (例如: 00:00:33 - 00:00:34)
function parseTimeRangeFormat(content) {
  console.log("使用时间范围格式专用解析器...");
  const subtitles = [];
  
  try {
    // 将内容分割成行
    const lines = content.split('\n');
    
    // 识别时间行的正则表达式
    const timeLineRegex = /(\d{2}:\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}:\d{2})/;
    
    // 时间字符串转毫秒
    const timeToMs = (timeStr) => {
      try {
        const [h, m, s] = timeStr.split(':').map(Number);
        return (h * 3600 + m * 60 + s) * 1000;
      } catch (e) {
        console.error('时间转换错误:', e);
        return 0;
      }
    };
    
    // 查找所有时间行和文本对
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // 匹配时间行
      const timeMatch = line.match(timeLineRegex);
      if (timeMatch) {
        const startTime = timeMatch[1];
        const endTime = timeMatch[2];
        
        // 收集文本内容 - 可能在当前行之后或同一行之后
        let textContent = '';
        
        // 检查时间行后是否有额外内容
        const timeEndIndex = line.indexOf(endTime) + endTime.length;
        if (timeEndIndex < line.length) {
          // 提取时间后的文本内容
          textContent = line.substring(timeEndIndex).trim();
          // 如果以冒号或空格开始，去掉第一个字符
          if (textContent.startsWith(':') || textContent.startsWith(' ')) {
            textContent = textContent.substring(1).trim();
          }
        }
        
        // 如果当前行没有文本内容，查找下一行
        if (!textContent && i + 1 < lines.length) {
          let nextLineIndex = i + 1;
          // 收集直到下一个时间行或空行
          while (nextLineIndex < lines.length && 
                 lines[nextLineIndex].trim() && 
                 !timeLineRegex.test(lines[nextLineIndex])) {
            // 添加到文本内容
            if (textContent) textContent += '<br>';
            textContent += lines[nextLineIndex].trim();
            nextLineIndex++;
          }
        }
        
        // 如果找到了文本内容，创建字幕条目
        if (textContent) {
          const startMs = timeToMs(startTime);
          const endMs = timeToMs(endTime);
          
          // 确保时间范围有效
          if (startMs < endMs) {
            subtitles.push({
              start: startMs,
              end: endMs,
              text: textContent
            });
          }
        } else {
          console.log(`时间行 ${startTime} - ${endTime} 没有找到对应的文本内容`);
        }
      }
    }
    
    // 如果找到至少一条字幕，返回结果
    if (subtitles.length > 0) {
      console.log(`时间范围解析器找到 ${subtitles.length} 条字幕`);
      return subtitles;
    }
    
    // 回退方案：尝试检测时间和文本交替出现的模式
    console.log("标准方法未找到字幕，尝试交替模式解析");
    
    // 分离时间行和文本行
    const timeLines = [];
    const textLines = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      if (timeLineRegex.test(trimmedLine)) {
        // 这是一个时间行
        timeLines.push(trimmedLine);
      } else if (!trimmedLine.startsWith('[') && 
                 !trimmedLine.includes('Format:') && 
                 !trimmedLine.includes('RARBG')) {
        // 这看起来是一个文本行
        textLines.push(trimmedLine);
      }
    }
    
    console.log(`找到 ${timeLines.length} 条时间行和 ${textLines.length} 条文本行`);
    
    // 如果时间行和文本行数量成比例，则认为它们是成对的
    if (timeLines.length > 0 && textLines.length > 0) {
      // 尝试按顺序匹配它们
      const maxPairs = Math.min(timeLines.length, textLines.length);
      
      for (let i = 0; i < maxPairs; i++) {
        const timeLine = timeLines[i];
        const textLine = textLines[i];
        
        const timeMatch = timeLine.match(timeLineRegex);
        if (timeMatch) {
          const startTime = timeMatch[1];
          const endTime = timeMatch[2];
          
          const startMs = timeToMs(startTime);
          const endMs = timeToMs(endTime);
          
          if (startMs < endMs) {
            subtitles.push({
              start: startMs,
              end: endMs,
              text: textLine
            });
          }
        }
      }
      
      console.log(`交替模式解析找到 ${subtitles.length} 条字幕`);
    }
    
    return subtitles;
  } catch (e) {
    console.error("时间范围字幕解析错误:", e);
    return [];
  }
} 