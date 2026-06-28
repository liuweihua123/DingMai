/* ═══════════════════════════════════════════════
   共用工具 — Common Utilities
   数据操作通过 api.js 调用后端 API
   ═══════════════════════════════════════════════ */

const Club = {
  /* ─── 防抖工具 ─── */
  _loadingBtns: new Set(),

  // 按钮防抖：点击后立即进入加载状态，完成后恢复
  async btnLoading(btn, asyncFn) {
    if (typeof btn === 'string') btn = document.querySelector(btn);
    if (!btn || this._loadingBtns.has(btn)) return;
    this._loadingBtns.add(btn);
    const origText = btn.innerHTML;
    btn.classList.add('btn--loading');
    btn.disabled = true;
    try {
      return await asyncFn();
    } finally {
      btn.classList.remove('btn--loading');
      btn.disabled = false;
      btn.innerHTML = origText;
      this._loadingBtns.delete(btn);
    }
  },

  // 防抖函数
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  // 骨架屏 HTML
  skeleton(count = 3) {
    return Array.from({ length: count }, () => `
      <div style="padding:var(--space-lg);border-bottom:1px solid var(--border)">
        <div class="skeleton skeleton-line--short skeleton-line" style="height:16px;width:60%"></div>
        <div class="skeleton skeleton-line--full skeleton-line" style="margin-top:8px"></div>
        <div class="skeleton skeleton-line--medium skeleton-line" style="margin-top:4px"></div>
      </div>
    `).join('');
  },

  /* ─── 分类缓存 ─── */
  _categories: null,

  async loadCategories() {
    if (!this._categories) {
      this._categories = await api.meta.getCategories();
    }
    return this._categories;
  },

  getCategoryName(categoryId) {
    if (!this._categories) return categoryId;
    const cat = this._categories.find(c => c.id === categoryId);
    return cat ? cat.name : categoryId;
  },

  getCategoryIcon(categoryId) {
    if (!this._categories) return '📋';
    const cat = this._categories.find(c => c.id === categoryId);
    return cat ? cat.icon : '📋';
  },

  /* ─── Auth（代理到 api.auth）─── */
  auth: {
    getCurrentUser() {
      return api.auth.getLocalUser();
    },

    isLoggedIn() {
      return api.auth.isLoggedIn();
    },

    getUserPoints() {
      const user = api.auth.getLocalUser();
      return user ? user.points : 0;
    },

    requireAuth() {
      return api.auth.requireAuth();
    },

    logout() {
      api.auth.logout();
    },
  },

  /* ─── User Dropdown Menu ─── */
  toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (!dropdown) return;
    const isActive = dropdown.classList.contains('active');
    // 先关闭所有下拉菜单
    document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('active'));
    // 同时关闭主题子菜单
    const submenu = document.getElementById('theme-submenu');
    if (submenu) submenu.classList.remove('active');
    if (!isActive) {
      dropdown.classList.add('active');
      // 点击外部关闭
      const close = (e) => {
        if (!dropdown.contains(e.target) && !e.target.closest('.nav__avatar')) {
          dropdown.classList.remove('active');
          if (submenu) submenu.classList.remove('active');
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 10);
    }
  },

  /* ─── Settings Modal ─── */
  showSettingsModal() {
    document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('active'));

    const user = api.auth.getLocalUser();
    const existing = document.getElementById('settings-modal');
    if (existing) existing.remove();

    const avatarUrl = user.avatar || '';
    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : user.username.charAt(0).toUpperCase();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'settings-modal';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 440px;">
        <div class="modal__title" style="margin-bottom: var(--space-xl); text-align:center;">账号设置</div>
        <!-- 头像 -->
        <div style="text-align:center; margin-bottom: var(--space-xl);">
          <div id="set-avatar-preview" style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,var(--gold-dark),var(--gold));display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:var(--bg-primary);margin:0 auto var(--space-md);cursor:pointer;overflow:hidden;border:3px solid var(--border);transition:border-color 0.3s" onclick="document.getElementById('set-avatar-input').click()">
            ${avatarHtml}
          </div>
          <input type="file" id="set-avatar-input" accept="image/*" style="display:none" onchange="Club.uploadAvatar(this)">
          <div style="font-size:13px; color:var(--gold); cursor:pointer;" onclick="document.getElementById('set-avatar-input').click()">📷 更换头像</div>
          <div id="set-avatar-status" style="font-size:12px;color:var(--text-dim);margin-top:4px"></div>
        </div>
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input type="text" class="form-input" value="${user.username}" disabled style="opacity:0.5">
        </div>
        <div class="form-group">
          <label class="form-label">手机号</label>
          <input type="tel" class="form-input" id="set-phone" value="${user.phone || ''}" placeholder="填写手机号">
        </div>
        <div class="form-group">
          <label class="form-label">修改密码</label>
          <input type="password" class="form-input" id="set-old-pw" placeholder="原密码（不修改可留空）" style="margin-bottom:8px">
          <input type="password" class="form-input" id="set-new-pw" placeholder="新密码（至少6位）">
        </div>
        <div id="set-error" class="form-error" style="display:none;margin-bottom:var(--space-md)"></div>
        <div style="display:flex;gap:var(--space-md);margin-top:var(--space-xl)">
          <button class="btn btn--ghost" style="flex:1" onclick="document.getElementById('settings-modal').remove()">取消</button>
          <button class="btn btn--primary" style="flex:1" onclick="Club.saveSettings()">保存</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  },

  async saveSettings() {
    const phone = document.getElementById('set-phone').value.trim();
    const oldPw = document.getElementById('set-old-pw').value;
    const newPw = document.getElementById('set-new-pw').value;
    const errorEl = document.getElementById('set-error');

    try {
      // 更新手机号
      await api.request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ phone }),
      });

      // 修改密码
      if (oldPw && newPw) {
        if (newPw.length < 6) {
          errorEl.textContent = '新密码至少6位';
          errorEl.style.display = '';
          return;
        }
        const result = await api.request('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
        });
        if (!result.success) {
          errorEl.textContent = result.error || '密码修改失败';
          errorEl.style.display = '';
          return;
        }
      }

      // 刷新本地用户数据
      await api.auth.getMe();
      document.getElementById('settings-modal').remove();
      this.toast('设置已保存', 'success');

      // 如果改了密码，提示重新登录
      if (oldPw && newPw) {
        setTimeout(() => {
          this.toast('密码已修改，请重新登录', 'info');
          setTimeout(() => api.auth.logout(), 1500);
        }, 1000);
      }
    } catch (err) {
      errorEl.textContent = err.message || '保存失败';
      errorEl.style.display = '';
    }
  },

  async uploadAvatar(input) {
    const file = input.files[0];
    if (!file) return;
    const statusEl = document.getElementById('set-avatar-status');
    statusEl.textContent = '上传中...';
    const previewEl = document.getElementById('set-avatar-preview');
    const spinner = previewEl ? this.showUploadSpinner(previewEl) : null;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('club_token') },
        body: formData,
      });
      const data = await res.json();
      this.removeUploadSpinner(spinner);
      if (data.success) {
        // 更新头像
        await api.request('/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({ avatar: data.url }),
        });
        // 刷新本地数据
        await api.auth.getMe();
        // 更新预览
        const preview = document.getElementById('set-avatar-preview');
        if (preview) {
          preview.innerHTML = `<img src="${data.url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        }
        statusEl.textContent = '✅ 头像已更新';
        this.toast('头像更新成功', 'success');
        // 更新导航栏头像
        setTimeout(() => location.reload(), 1000);
      } else {
        statusEl.textContent = '❌ ' + (data.error || '上传失败');
      }
    } catch (e) {
      statusEl.textContent = '❌ 上传失败';
    }
    input.value = '';
  },

  /* ─── 更新导航栏积分显示 ─── */
  updateNavPoints() {
    const user = this.auth.getLocalUser();
    if (!user) return;
    // 更新导航栏积分
    const navPts = document.getElementById('nav-points');
    if (navPts) navPts.textContent = user.points;
    // 更新下拉菜单积分
    const dropPts = document.getElementById('dropdown-points');
    if (dropPts) dropPts.textContent = user.points + ' 积分';
  },

  /* ─── Logout Confirmation ─── */
  showLogoutConfirm() {
    // 关闭下拉菜单
    document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('active'));

    const existing = document.getElementById('logout-confirm-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'logout-confirm-modal';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 380px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: var(--space-lg);">👋</div>
        <div class="modal__title" style="margin-bottom: var(--space-md);">确认退出</div>
        <div class="modal__body" style="margin-bottom: var(--space-xl);">
          确定要退出登录吗？退出后需要重新登录才能查看资源详情。
        </div>
        <div style="display: flex; gap: var(--space-md);">
          <button class="btn btn--ghost" style="flex:1" onclick="document.getElementById('logout-confirm-modal').remove()">取消</button>
          <button class="btn btn--primary" style="flex:1" onclick="api.auth.logout()">确认退出</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  },

  /* ─── Toast ─── */
  toast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const icons = {
      success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <span style="color: ${type === 'success' ? 'var(--accent-green)' : type === 'error' ? 'var(--accent-red)' : 'var(--gold)'}">${icons[type]}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.4s var(--ease-out) forwards';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  },

  /* ─── 自定义确认弹窗 ─── */
  confirm({ title = '确认操作', message = '', confirmText = '确认', cancelText = '取消', type = 'default' } = {}) {
    return new Promise((resolve) => {
      const existing = document.getElementById('custom-confirm-modal');
      if (existing) existing.remove();

      const iconMap = {
        default: '❓',
        danger: '⚠️',
        success: '✅',
        info: 'ℹ️',
      };

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay active';
      overlay.id = 'custom-confirm-modal';
      overlay.innerHTML = `
        <div class="modal" style="max-width:400px;text-align:center">
          <div style="font-size:48px;margin-bottom:var(--space-lg)">${iconMap[type] || iconMap.default}</div>
          <h3 style="font-family:var(--font-display);font-size:20px;margin-bottom:var(--space-md)">${title}</h3>
          ${message ? `<p style="font-size:14px;color:var(--text-secondary);line-height:1.7;margin-bottom:var(--space-xl)">${message}</p>` : '<div style="margin-bottom:var(--space-xl)"></div>'}
          <div style="display:flex;gap:var(--space-md)">
            <button class="btn btn--ghost" style="flex:1" id="confirm-cancel">${cancelText}</button>
            <button class="btn ${type === 'danger' ? 'btn--danger' : 'btn--primary'}" style="flex:1" id="confirm-ok">${confirmText}</button>
          </div>
        </div>
      `;

      const cleanup = (result) => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
        resolve(result);
      };

      overlay.querySelector('#confirm-cancel').onclick = () => cleanup(false);
      overlay.querySelector('#confirm-ok').onclick = () => cleanup(true);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
      document.body.appendChild(overlay);
    });
  },

  /* ─── Coin Burst Effect ─── */
  coinBurst(x, y, count = 12) {
    const burst = document.createElement('div');
    burst.className = 'coin-burst';
    burst.style.left = x + 'px';
    burst.style.top = y + 'px';
    document.body.appendChild(burst);

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'coin-particle';
      const angle = (Math.PI * 2 * i) / count;
      const distance = 40 + Math.random() * 60;
      particle.style.setProperty('--tx', Math.cos(angle) * distance + 'px');
      particle.style.setProperty('--ty', Math.sin(angle) * distance + 'px');
      particle.style.animationDelay = (Math.random() * 0.2) + 's';
      burst.appendChild(particle);
    }

    setTimeout(() => burst.remove(), 1500);
  },

  /* ─── Render Navigation ─── */
  renderNav(activePage = '') {
    const user = api.auth.getLocalUser();
    const nav = document.createElement('nav');
    nav.className = 'nav';
    nav.innerHTML = `
      <div class="nav__inner">
        <a href="index.html" class="nav__brand">
          <div class="nav__logo">鼎</div>
          <span class="nav__title">鼎脉人脉</span>
        </a>
        <div class="nav__links">
          <a href="index.html" class="nav__link ${activePage === 'home' ? 'active' : ''}">首页</a>
          <a href="list.html" class="nav__link ${activePage === 'list' ? 'active' : ''}">资源库</a>
          <a href="forum.html" class="nav__link ${activePage === 'forum' ? 'active' : ''}">论坛</a>
          ${user ? `<a href="publish.html" class="nav__link ${activePage === 'publish' ? 'active' : ''}">发布资源</a>` : ''}
          ${user ? `<a href="user.html" class="nav__link ${activePage === 'user' ? 'active' : ''}">个人中心</a>` : ''}
        </div>
        <div class="nav__user">
          ${user ? `
            <a href="user.html" class="nav__points">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v12M6 12h12"/>
              </svg>
              <span id="nav-points">${user.points}</span> 积分
            </a>
            <div style="position:relative">
              <div class="nav__avatar" onclick="Club.toggleUserMenu()" title="个人菜单">
                ${user.avatar ? `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : user.username.charAt(0).toUpperCase()}
              </div>
              <div class="user-dropdown" id="user-dropdown">
                <div class="user-dropdown__header">
                  <div class="user-dropdown__name">${user.username}</div>
                  <div class="user-dropdown__points" id="dropdown-points">${user.points} 积分</div>
                </div>
                <div class="user-dropdown__divider"></div>
                <a href="user.html" class="user-dropdown__item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  个人中心
                </a>
                <div class="user-dropdown__item" onclick="Club.showSettingsModal()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  个人设置
                </div>
                <div class="user-dropdown__divider"></div>
                <div class="user-dropdown__item user-dropdown__item--danger" onclick="Club.showLogoutConfirm()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  退出登录
                </div>
              </div>
            </div>
          ` : `
            <a href="login.html" class="btn btn--primary btn--sm">登录 / 注册</a>
          `}
        </div>
      </div>
    `;
    document.body.prepend(nav);

    // Scroll effect
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    });
  },

  /* ─── Render Footer ─── */
  renderFooter() {
    const footer = document.createElement('footer');
    footer.className = 'footer';
    footer.innerHTML = `
      <div class="footer__inner">
        <span class="footer__text">© 2024 鼎脉人脉 — 高端人脉资源共享平台</span>
        <div class="footer__links">
          <a href="#" class="footer__link">关于我们</a>
          <a href="#" class="footer__link">使用条款</a>
          <a href="#" class="footer__link">隐私政策</a>
          <a href="#" class="footer__link">联系客服</a>
        </div>
      </div>
    `;
    document.body.appendChild(footer);

    // 手机端底部导航
    if (window.innerWidth <= 768) {
      this.renderMobileNav();
    }
  },

  renderMobileNav() {
    const active = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    const items = [
      { id: 'index', label: '首页', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
      { id: 'list', label: '资源库', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' },
      { id: 'forum', label: '论坛', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
      { id: 'user', label: '我的', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
    ];

    const nav = document.createElement('nav');
    nav.className = 'mobile-nav';
    nav.innerHTML = items.map(item => `
      <a href="${item.id}.html" class="mobile-nav__item ${active === item.id ? 'active' : ''}">
        ${item.icon}
        <span>${item.label}</span>
      </a>
    `).join('');
    document.body.appendChild(nav);
  },

  /* ─── Format Date ─── */
  /* ─── 图片灯箱（点击放大） ─── */
  initLightbox() {
    // 已有则跳过
    if (document.getElementById('lightbox-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'lightbox-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:5000;display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transition:all 0.3s;cursor:zoom-out;padding:20px';
    overlay.innerHTML = '<img id="lightbox-img" style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:8px;transform:scale(0.9);transition:transform 0.3s">';
    overlay.onclick = () => Club.closeLightbox();
    document.body.appendChild(overlay);

    // 给页面上所有内容图片绑定点击
    document.addEventListener('click', (e) => {
      const img = e.target;
      // 匹配帖子内容、回复内容中的图片
      if (img.tagName === 'IMG' && img.closest('.detail-intro, .post-detail__content, .reply-content, .post-card__body, .new-post-form__content')) {
        e.stopPropagation();
        Club.openLightbox(img.src);
      }
    });

    // ESC 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') Club.closeLightbox();
    });
  },

  openLightbox(src) {
    const overlay = document.getElementById('lightbox-overlay');
    const img = document.getElementById('lightbox-img');
    if (!overlay || !img) return;
    img.src = src;
    overlay.style.opacity = '1';
    overlay.style.visibility = 'visible';
    img.style.transform = 'scale(1)';
  },

  closeLightbox() {
    const overlay = document.getElementById('lightbox-overlay');
    const img = document.getElementById('lightbox-img');
    if (!overlay) return;
    overlay.style.opacity = '0';
    overlay.style.visibility = 'hidden';
    if (img) img.style.transform = 'scale(0.9)';
  },

  /* ─── 上传中覆盖层 ─── */
  showUploadSpinner(container) {
    const spinner = document.createElement('div');
    spinner.className = 'upload-spinner-overlay';
    spinner.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10;border-radius:inherit';
    spinner.innerHTML = '<div style="width:32px;height:32px;border:3px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite"></div>';
    container.style.position = 'relative';
    container.appendChild(spinner);
    return spinner;
  },

  removeUploadSpinner(spinner) {
    if (spinner && spinner.parentNode) spinner.remove();
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    // 兼容 SQLite 日期格式 "YYYY-MM-DD HH:MM:SS"
    const str = dateStr.replace(' ', 'T').replace(/(\d{4}-\d{2}-\d{2})$/, '$1T00:00:00');
    const d = new Date(str);
    if (isNaN(d.getTime())) return dateStr;

    const now = new Date();
    const diff = now - d;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    if (days < 365) {
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  /* ─── Format Number ─── */
  formatNumber(num) {
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  },

  /* ─── Animate Counter ─── */
  animateCounter(element, target, duration = 2000) {
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (target - start) * eased);
      element.textContent = current.toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  },

  /* ─── Init Page ─── */
  async initPage(activePage) {
    this.renderNav(activePage);
    this.renderFooter();
    this.initTheme();
    this.initLightbox();

    // 加载分类缓存
    await this.loadCategories();

    // Page enter animation
    document.body.style.opacity = '0';
    requestAnimationFrame(() => {
      document.body.style.transition = 'opacity 0.5s var(--ease-out)';
      document.body.style.opacity = '1';
    });
  },

  /* ─── URL Params ─── */
  getParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  },

  /* ─── Theme Switcher ─── */
  THEMES: [
    { id: 'dark-gold', name: '暗金经典', icon: '🌙' },
    { id: 'ocean-blue', name: '深蓝海洋', icon: '🌊' },
    { id: 'emerald-green', name: '翡翠绿野', icon: '🌿' },
    { id: 'violet-dream', name: '紫罗兰梦', icon: '🔮' },
    { id: 'light-clean', name: '亮白简约', icon: '☀️' },
  ],

  initTheme() {
    const saved = localStorage.getItem('club_theme') || 'light-clean';
    document.documentElement.setAttribute('data-theme', saved);

    // 创建右上角主题按钮
    const wrapper = document.createElement('div');
    wrapper.className = 'theme-nav-btn';
    wrapper.innerHTML = `
      <button class="theme-nav-trigger" onclick="Club.toggleThemePanel()" title="切换主题">🎨</button>
      <div class="theme-panel" id="theme-panel">
        <div class="theme-panel__title">选择主题</div>
        ${this.THEMES.map(t => `
          <button class="theme-option ${saved === t.id ? 'active' : ''}" data-theme="${t.id}" onclick="Club.setTheme('${t.id}')">
            <div class="theme-option__dot" style="background:${this.getThemePreviewColor(t.id)}"></div>
            ${t.icon} ${t.name}
          </button>
        `).join('')}
      </div>
    `;

    // 如果有导航栏，插入到导航栏右侧；否则固定在页面右上角
    const navUser = document.querySelector('.nav__user');
    if (navUser) {
      navUser.prepend(wrapper);
    } else {
      wrapper.style.position = 'fixed';
      wrapper.style.top = '16px';
      wrapper.style.right = '24px';
      wrapper.style.zIndex = '1001';
      document.body.appendChild(wrapper);
    }

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-nav-btn')) {
        const panel = document.getElementById('theme-panel');
        if (panel) panel.classList.remove('active');
      }
    });
  },

  getThemePreviewColor(id) {
    const colors = {
      'dark-gold': '#c9a96e',
      'ocean-blue': '#5b9bd5',
      'emerald-green': '#5cb87a',
      'violet-dream': '#b07ad8',
      'light-clean': '#b8860b',
    };
    return colors[id] || '#999';
  },

  setTheme(themeId, save = true) {
    if (save) localStorage.setItem('club_theme', themeId);
    document.documentElement.setAttribute('data-theme', themeId);

    document.querySelectorAll('.theme-option').forEach(el => {
      el.classList.toggle('active', el.dataset.theme === themeId);
    });

    // 关闭面板
    const panel = document.getElementById('theme-panel');
    if (panel && save) {
      setTimeout(() => panel.classList.remove('active'), 300);
    }
  },

  toggleThemePanel() {
    const panel = document.getElementById('theme-panel');
    if (panel) panel.classList.toggle('active');
  },
};
