import axios from 'axios';

/**
 * 提供LLM相关的API服务
 */
class LlmService {
  constructor() {
    this.baseUrl = 'http://47.121.117.100:3000/api/llm';
    this.agentId = "naQivTmsDa";
    this.cookie = "_qimei_uuid42=193010b053510040bdbe959987347987350c2698a9; hy_source=web; _qimei_fingerprint=579ad3031f0737dafe77266cbcb409d8; _qimei_i_3=66c04685c60e02dac5c4fe615b8626e3f2b8f6a04409578be2de7b5e2e93753e626a3f973989e2a0d790; _qimei_h38=72e5991abdbe9599873479870300000f019301; hy_user=changhozhao; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; _qimei_i_1=4cde5185970f55d2c896af620fd626e9f2e7adf915580785bd872f582593206c616361953980e1dcd784a1e7; hy_source=web; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; hy_user=changhozhao";
    this.model = "gpt_175B_0404";
  }

  /**
   * 创建LLM会话
   * @returns {Promise<string|null>} 会话ID或null
   */
  async createConversation() {
    try {
      const response = await axios.post(`${this.baseUrl}/conversation/create`, {
        agentId: this.agentId,
        cookie: this.cookie
      });
      
      if (response.data.success) {
        console.log("创建LLM会话成功:", response.data.data.id);
        return response.data.data.id;
      } else {
        throw new Error("创建会话失败: " + JSON.stringify(response.data));
      }
    } catch (error) {
      console.error("创建LLM会话出错:", error);
      throw new Error("创建AI分析会话失败: " + (error.message || "未知错误"));
    }
  }

  /**
   * 向LLM发送聊天请求
   * @param {string} conversationId 会话ID
   * @param {string} prompt 提示内容
   * @returns {Promise<Object>} LLM的响应
   */
  async sendChatMessage(conversationId, prompt) {
    try {
      console.log("发送分析请求，会话ID:", conversationId);
      const response = await axios.post(`${this.baseUrl}/chat/${conversationId}`, {
        prompt: prompt,
        agentId: this.agentId,
        model: this.model,
        cookie: this.cookie
      });
      
      if (response.data.success) {
        return response.data;
      } else {
        throw new Error("AI请求失败: " + JSON.stringify(response.data));
      }
    } catch (error) {
      console.error("LLM请求出错:", error);
      throw new Error("LLM请求失败: " + (error.message || "未知错误"));
    }
  }

  /**
   * 分析字幕内容
   * @param {string} subtitleText 要分析的字幕文本
   * @param {string|null} existingConversationId 可选的已有会话ID
   * @returns {Promise<{result: Array, conversationId: string}>} 分析结果和会话ID
   */
  async analyzeSubtitleContent(subtitleText, existingConversationId = null) {
    // 确保有会话ID
    let conversationId = existingConversationId;
    if (!conversationId) {
      conversationId = await this.createConversation();
    }
    
    if (!conversationId) {
      throw new Error("未能创建有效的分析会话");
    }
    
    // 构建分析提示
    const prompt = `
###
你现在一位翻译专家，现在正帮我理解一个英语字幕文件，我是中国英语四级水平，要求如下：
1、您的任务是翻译和分析给定文本中的语言难点，这些难点可能包括对非母语学习者具有挑战性的词汇、短语、俚语、缩写、简写以及网络用语等。
2、输出格式为json数组，示例如下：
[
    {
        "type": "Words",
        "vocabulary": "ubiquitous",
        "difficulty": "C1",
        "part_of_speech": "adj.",
        "phonetic": "/juːˈbɪkwɪtəs/",
        "chinese_meaning": "无处不在的"
    },
    ...
]
3、其他注意事项：
- 优先选择在语境中确实影响理解的表达，而不仅仅是生僻词
- 如遇同等难度的表达，优先选择在日常生活或学习中更有用的

以下是需要分析的字幕文本：
${subtitleText}
###
`;

    const response = await this.sendChatMessage(conversationId, prompt);
    
    try {
      // 尝试解析返回的JSON
      const content = response.data.content;
      
      // 查找JSON数据
      let jsonData = null;
      const jsonMatch = content.match(/\[\s*\{.+\}\s*\]/s);
      
      if (jsonMatch) {
        jsonData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("无法从响应中提取JSON数据");
      }
      
      if (Array.isArray(jsonData) && jsonData.length > 0) {
        return {
          result: jsonData,
          conversationId: conversationId
        };
      } else {
        throw new Error("解析结果为空或格式不正确");
      }
    } catch (parseError) {
      console.error("解析AI响应JSON错误:", parseError);
      throw new Error("解析分析结果出错: " + parseError.message);
    }
  }
}

// 导出单例实例
const llmService = new LlmService();
export default llmService;