/**
 * AI 服务层
 * 支持 Google Gemini / 通义千问 / DeepSeek
 */

class AIService {
  constructor() {
    this.provider = 'gemini';
    this.apiKey = '';
    this.model = '';
  }

  configure(provider, apiKey, model) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model || '';
  }

  isConfigured() {
    return !!this.apiKey;
  }

  // ===== 解析自然语言输入 =====

  async parseInput(text) {
    if (!this.isConfigured()) {
      return this._fallbackParse(text);
    }

    const prompt = `你是一个记账助手。请从以下文字中提取记账信息，严格返回 JSON 格式，不要返回其他内容：
{"type": "expense 或 income", "amount": 数字, "category": "分类名", "note": "简短备注"}

可用支出分类：餐饮、交通、购物、居住、娱乐、饮品、医疗、教育、社交、其他
可用收入分类：工资、奖金、兼职、投资、其他

用户输入："${text}"`;

    try {
      const response = await this._callAPI(prompt);
      const json = this._extractJSON(response);
      if (json && json.amount > 0) {
        return json;
      }
    } catch (e) {
      console.warn('AI parse failed, using fallback:', e);
    }

    return this._fallbackParse(text);
  }

  // ===== 生成月度总结 =====

  async generateSummary(records, budget, prevRecords) {
    if (!this.isConfigured()) {
      return this._fallbackSummary(records, budget);
    }

    // 汇总数据
    const expenses = records.filter(r => r.type === 'expense');
    const total = expenses.reduce((s, r) => s + r.amount, 0);
    const catMap = {};
    expenses.forEach(r => {
      catMap[r.category] = (catMap[r.category] || 0) + r.amount;
    });
    const catSummary = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `${cat}: ¥${amt.toFixed(0)}`)
      .join('、');

    let prevTotal = 0;
    if (prevRecords) {
      prevTotal = prevRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    }

    const prompt = `你是一个理财顾问。请根据以下月度消费数据，用 2-3 句简洁的中文给出分析和建议。不要用 markdown 格式。
月预算：${budget} 元
本月总支出：¥${total.toFixed(2)}
上月总支出：¥${prevTotal.toFixed(2)}
分类明细：${catSummary}
要求：提到总支出、预算使用率、占比最高的分类、与上月变化、结余预测。语气友好简洁。`;

    try {
      return await this._callAPI(prompt);
    } catch (e) {
      console.warn('AI summary failed, using fallback:', e);
      return this._fallbackSummary(records, budget);
    }
  }

  // ===== API 调用 =====

  async _callAPI(prompt) {
    switch (this.provider) {
      case 'gemini': return this._callGemini(prompt);
      case 'qwen': return this._callQwen(prompt);
      case 'deepseek': return this._callDeepSeek(prompt);
      default: throw new Error('Unknown provider');
    }
  }

  async _callGemini(prompt) {
    const model = this.model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
      })
    });
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  async _callQwen(prompt) {
    const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model || 'qwen-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, max_tokens: 500
      })
    });
    if (!res.ok) throw new Error(`Qwen API error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async _callDeepSeek(prompt) {
    const url = 'https://api.deepseek.com/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, max_tokens: 500
      })
    });
    if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // ===== 工具方法 =====

  _extractJSON(text) {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }

  // ===== 本地 fallback（无 API Key 时） =====

  _fallbackParse(text) {
    const amountMatch = text.match(/(\d+\.?\d*)/);
    if (!amountMatch) return null;
    const amount = parseFloat(amountMatch[1]);
    if (amount <= 0) return null;

    const desc = text.replace(amountMatch[0], '').replace(/[元块钱￥¥]/g, '').trim();

    // 判断收支
    const incomeKW = ['工资','薪水','到账','收入','奖金','兼职','外快','理财','收益','分红','利息','退款','转入','还我'];
    let type = 'expense';
    for (const kw of incomeKW) {
      if (text.includes(kw)) { type = 'income'; break; }
    }

    // 匹配分类
    const categories = {
      expense: {
        '餐饮': ['午饭','晚饭','早饭','吃饭','外卖','餐','饭','小吃','火锅','面','快餐','食堂','夜宵','早餐','午餐','晚餐','奶茶','汉堡','披萨','饺子','米饭','炒菜','盒饭'],
        '交通': ['打车','地铁','公交','滴滴','出租','加油','停车','高速','火车','飞机','机票','车票','骑车','油费','交通'],
        '购物': ['购物','买','衣服','鞋','包','化妆品','淘宝','京东','网购','超市','商场','日用品','水果','零食'],
        '居住': ['房租','租金','水费','电费','燃气','物业','宽带','网费'],
        '娱乐': ['电影','游戏','KTV','旅游','门票','演出','会员','视频','音乐'],
        '饮品': ['咖啡','星巴克','瑞幸','拿铁','美式','奶茶','茶','饮料'],
        '医疗': ['医院','看病','药','体检','挂号','门诊'],
        '教育': ['课程','培训','学费','书','考试','学习'],
        '社交': ['红包','礼物','请客','聚餐','份子钱','随礼'],
      },
      income: {
        '工资': ['工资','薪水','月薪','发工资'],
        '奖金': ['奖金','年终','绩效','补贴'],
        '兼职': ['兼职','外快','副业','稿费'],
        '投资': ['理财','收益','分红','利息','股票','基金'],
      }
    };

    let category = '其他';
    let maxLen = 0;
    const catMap = categories[type] || {};
    for (const [cat, keywords] of Object.entries(catMap)) {
      for (const kw of keywords) {
        if (text.includes(kw) && kw.length > maxLen) {
          category = cat;
          maxLen = kw.length;
        }
      }
    }

    return { type, amount, category, note: desc || category };
  }

  _fallbackSummary(records, budget) {
    const expenses = records.filter(r => r.type === 'expense');
    const total = expenses.reduce((s, r) => s + r.amount, 0);
    const pct = budget > 0 ? ((total / budget) * 100).toFixed(1) : 0;
    const catMap = {};
    expenses.forEach(r => { catMap[r.category] = (catMap[r.category] || 0) + r.amount; });
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    const remaining = budget - total;

    let text = `本月已支出 ¥${total.toFixed(2)}，预算使用率 ${pct}%。`;
    if (topCat) {
      const topPct = ((topCat[1] / total) * 100).toFixed(0);
      text += `${topCat[0]}占比最高达 ${topPct}%。`;
    }
    if (remaining > 0) {
      text += `预计月末可结余约 ¥${remaining.toFixed(0)}。`;
    } else {
      text += `已超出预算 ¥${Math.abs(remaining).toFixed(0)}，建议控制支出。`;
    }
    return text;
  }
}

const ai = new AIService();
