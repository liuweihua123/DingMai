// 拦截 localStorage.setItem，用户数据变化时自动更新导航栏积分
const _origSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key, value) {
  _origSetItem(key, value);
  if (key === 'club_user') {
    try {
      const user = JSON.parse(value);
      const navPts = document.getElementById('nav-points');
      if (navPts && user) navPts.textContent = user.points;
      const dropPts = document.getElementById('dropdown-points');
      if (dropPts && user) dropPts.textContent = user.points + ' 积分';
    } catch (e) {}
  }
};

/* ═══════════════════════════════════════════════
   API 请求封装 — Frontend API Layer
   ═══════════════════════════════════════════════ */

const API_BASE = '/api';

const api = {
  // ─── 通用请求 ───
  async request(path, options = {}) {
    const token = localStorage.getItem('club_token');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    const data = await res.json();

    if (!res.ok) {
      throw { status: res.status, message: data.error || '请求失败', code: data.code };
    }

    return data;
  },

  // ─── 认证 ───
  auth: {
    async login(username, password) {
      const data = await api.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem('club_token', data.token);
      localStorage.setItem('club_user', JSON.stringify(data.user));
      return data;
    },

    async register(username, password, phone) {
      const data = await api.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, phone }),
      });
      localStorage.setItem('club_token', data.token);
      localStorage.setItem('club_user', JSON.stringify(data.user));
      return data;
    },

    logout() {
      localStorage.removeItem('club_token');
      localStorage.removeItem('club_user');
      window.location.href = 'index.html';
    },

    getLocalUser() {
      const data = localStorage.getItem('club_user');
      return data ? JSON.parse(data) : null;
    },

    isLoggedIn() {
      return !!localStorage.getItem('club_token');
    },

    async getMe() {
      const data = await api.request('/auth/me');
      localStorage.setItem('club_user', JSON.stringify(data));
      return data;
    },

    requireAuth() {
      if (!this.isLoggedIn()) {
        window.location.href = 'login.html';
        return false;
      }
      return true;
    },
  },

  // ─── 资源 ───
  resources: {
    async list(filters = {}) {
      const params = new URLSearchParams();
      if (filters.category) params.set('category', filters.category);
      if (filters.region) params.set('region', filters.region);
      if (filters.keyword) params.set('keyword', filters.keyword);
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.page) params.set('page', filters.page);
      if (filters.limit) params.set('limit', filters.limit);
      return api.request(`/resources?${params.toString()}`);
    },

    async get(id) {
      return api.request(`/resources/${id}`);
    },

    async unlock(id) {
      const data = await api.request(`/resources/${id}/unlock`, {
        method: 'POST',
      });
      // 更新本地用户积分
      if (data.success) {
        const user = api.auth.getLocalUser();
        if (user) {
          user.points = data.newBalance;
          localStorage.setItem('club_user', JSON.stringify(user));
        }
      }
      return data;
    },

    async hot(limit = 10) {
      return api.request(`/resources/hot?limit=${limit}`);
    },
  },

  // ─── 用户 ───
  user: {
    async recharge(planId) {
      const data = await api.request('/user/recharge', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      if (data.success) {
        const user = api.auth.getLocalUser();
        if (user) {
          user.points = data.newBalance;
          localStorage.setItem('club_user', JSON.stringify(user));
        }
      }
      return data;
    },

    async getTransactions() {
      return api.request('/user/transactions');
    },

    async getViewRecords() {
      return api.request('/user/view-records');
    },

    // 签到
    async getCheckinStatus() {
      return api.request('/user/checkin/status');
    },

    async checkin() {
      const data = await api.request('/user/checkin', { method: 'POST' });
      if (data.success) {
        const user = api.auth.getLocalUser();
        if (user) {
          user.points = data.newBalance;
          localStorage.setItem('club_user', JSON.stringify(user));
        }
      }
      return data;
    },

    // 收藏
    async toggleFavorite(resourceId) {
      return api.request(`/user/favorites/${resourceId}`, { method: 'POST' });
    },

    async getFavorites() {
      return api.request('/user/favorites');
    },

    async checkFavorite(resourceId) {
      return api.request(`/user/favorites/check/${resourceId}`);
    },
  },

  // ─── 支付 ───
  payment: {
    async create(planId) {
      return api.request('/payment/create', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
    },

    async confirm(orderNo) {
      return api.request('/payment/confirm', {
        method: 'POST',
        body: JSON.stringify({ orderNo }),
      });
    },

    async getStatus(orderNo) {
      return api.request(`/payment/status/${orderNo}`);
    },
  },

  // ─── 元数据 ───
  meta: {
    _cache: {},

    async getCategories() {
      if (this._cache.categories) return this._cache.categories;
      const data = await api.request('/categories');
      this._cache.categories = data;
      return data;
    },

    async getPlans() {
      if (this._cache.plans) return this._cache.plans;
      const data = await api.request('/plans');
      this._cache.plans = data;
      return data;
    },

    async getStats() {
      return api.request('/stats');
    },
  },
};
