/**
 * 存储层 — IndexedDB 实现
 * 抽象接口，后续可替换为 Cloudflare Worker + 飞书
 */

const DB_NAME = 'ai_accounting';
const DB_VERSION = 1;

class Store {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('records')) {
          const store = db.createObjectStore('records', { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  // ===== 记录操作 =====

  _tx(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  _request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async addRecord(record) {
    const data = {
      ...record,
      id: record.id || this.generateId(),
      createdAt: record.createdAt || Date.now(),
    };
    const store = this._tx('records', 'readwrite');
    await this._request(store.put(data));
    return data;
  }

  async updateRecord(id, updates) {
    const store = this._tx('records', 'readwrite');
    const existing = await this._request(store.get(id));
    if (!existing) throw new Error('Record not found');
    const updated = { ...existing, ...updates };
    await this._request(store.put(updated));
    return updated;
  }

  async deleteRecord(id) {
    const store = this._tx('records', 'readwrite');
    await this._request(store.delete(id));
  }

  async getRecord(id) {
    const store = this._tx('records');
    return this._request(store.get(id));
  }

  async getAllRecords() {
    const store = this._tx('records');
    return this._request(store.getAll());
  }

  async getRecordsByMonth(year, month) {
    const records = await this.getAllRecords();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return records
      .filter(r => r.date.startsWith(prefix))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getRecordsByDate(dateStr) {
    const store = this._tx('records');
    const index = store.index('date');
    return this._request(index.getAll(dateStr));
  }

  async getRecordsByDateRange(startDate, endDate) {
    const records = await this.getAllRecords();
    return records
      .filter(r => r.date >= startDate && r.date <= endDate)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // ===== 设置 =====

  async getSettings() {
    const store = this._tx('settings');
    const rows = await this._request(store.getAll());
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return {
      aiProvider: settings.aiProvider || 'gemini',
      aiModel: settings.aiModel || '',
      apiKey: settings.apiKey || '',
      monthlyBudget: settings.monthlyBudget || 5000,
    };
  }

  async saveSetting(key, value) {
    const store = this._tx('settings', 'readwrite');
    await this._request(store.put({ key, value }));
  }

  async saveSettings(settings) {
    for (const [key, value] of Object.entries(settings)) {
      await this.saveSetting(key, value);
    }
  }

  // ===== 导入导出 =====

  async exportJSON() {
    const records = await this.getAllRecords();
    const settings = await this.getSettings();
    return JSON.stringify({ records, settings, exportedAt: new Date().toISOString() }, null, 2);
  }

  async importJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data.records || !Array.isArray(data.records)) {
      throw new Error('无效的备份文件');
    }

    // 清空现有记录
    const store = this._tx('records', 'readwrite');
    await this._request(store.clear());

    // 导入记录
    for (const record of data.records) {
      await this.addRecord(record);
    }

    // 导入设置
    if (data.settings) {
      await this.saveSettings(data.settings);
    }

    return data.records.length;
  }

  async exportCSV(year, month) {
    const records = await this.getRecordsByMonth(year, month);
    const header = '日期,时间,类型,分类,金额,备注\n';
    const rows = records.map(r =>
      `${r.date},${r.time || ''},${r.type === 'expense' ? '支出' : '收入'},${r.category},${r.amount},${(r.note || '').replace(/,/g, '，')}`
    ).join('\n');
    return '\uFEFF' + header + rows;
  }
}

// 单例
const store = new Store();
