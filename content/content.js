/**
 * Temu 地址地图助手 - 内容脚本 v1.2
 * 在 Temu 订单后台的收货地址旁注入「地图」按钮，点击弹出小地图定位地址。
 * - 运行于隔离世界，通过 iframe 加载扩展自带的地图页 map.html，避免页面 CSP 与样式冲突。
 * - 支持穿透 shadow DOM 识别地址，含定时兜底扫描（分页/异步渲染也能命中）。
 * - 右下角调试角标用于确认脚本是否注入、找到多少个地址。
 */
(() => {
  if (window.__tmh_injected) return;
  window.__tmh_injected = true;

  const EXT_URL = chrome.runtime.getURL('');
  const processed = new WeakSet(); // 已注入按钮的元素，避免重复

  // ---------- 地址识别 ----------
  const COUNTRY_WORDS = [
    'united states of america','united states','usa','u.s.a.','united kingdom','great britain','uk',
    'canada','australia','new zealand','germany','france','italy','spain','netherlands','poland',
    'portugal','belgium','sweden','switzerland','austria','ireland','mexico','japan','brazil',
    'norway','denmark','finland','greece','czech republic','hungary','romania','slovakia',
    'slovenia','croatia','bulgaria','lithuania','latvia','estonia','turkey','serbia','ukraine'
  ];
  const CN_COUNTRIES = ['美国','英国','加拿大','澳大利亚','德国','法国','意大利','西班牙','荷兰','日本','墨西哥'];
  const SEL = 'div,span,p,li,td,section,article,address,a';

  function looksLikeAddress(t) {
    if (!t) return false;
    const s = t.trim();
    if (s.length < 8 || s.length > 320) return false;
    const lower = s.toLowerCase();
    const hasEnCountry = COUNTRY_WORDS.some((c) => lower.includes(c));
    const hasCnCountry = CN_COUNTRIES.some((c) => s.includes(c));
    if (!hasEnCountry && !hasCnCountry) return false;
    const hasUSZip = /\b\d{5}(-\d{4})?\b/.test(s);
    const hasUKZip = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/.test(s);
    const hasCAZip = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/.test(s);
    const hasZip = hasUSZip || hasUKZip || hasCAZip;
    const hasCityState = /,\s*[A-Z]{2}\b/.test(s);
    const commaCount = (s.match(/,/g) || []).length;
    const hasFullAddr = commaCount >= 2 && /\d/.test(s);
    return hasZip || hasCityState || hasFullAddr;
  }

  // 收集候选元素（穿透 shadow DOM）
  function collectCandidates(root) {
    const found = [];
    function addFrom(node) {
      if (node && node.querySelectorAll) {
        for (const el of node.querySelectorAll(SEL)) found.push(el);
      }
    }
    function collectShadow(host) {
      if (!host || !host.shadowRoot) return;
      addFrom(host.shadowRoot);
      for (const inner of host.shadowRoot.querySelectorAll('*')) {
        if (inner.shadowRoot) collectShadow(inner);
      }
    }
    addFrom(root);
    if (root && root.querySelectorAll) {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) collectShadow(el);
      }
    }
    return found;
  }

  function collectAddressEls(root) {
    const candidates = collectCandidates(root).filter((el) => {
      if (el.querySelector && el.querySelector('.tmh-map-btn')) return false;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return looksLikeAddress(t);
    });
    // 只保留最内层匹配元素（若某候选包含另一个候选，说明它是更粗的容器，丢弃）
    return candidates.filter((el) => {
      for (const other of candidates) {
        if (other !== el && el.contains(other)) return false;
      }
      return true;
    });
  }

  // ---------- 调试角标 ----------
  let foundCount = 0;
  function ensureBadge() {
    if (document.getElementById('tmh-badge')) return;
    const b = document.createElement('div');
    b.id = 'tmh-badge';
    b.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483646;display:flex;align-items:center;gap:8px;'
      + 'background:#1976d2;color:#fff;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
      + 'padding:6px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3);max-width:280px;';
    b.innerHTML = '<span>📍 地图助手 <span style="opacity:.7">v1.2</span></span>'
      + '<span id="tmh-badge-status" style="font-weight:600"></span>'
      + '<button id="tmh-badge-close" style="background:none;border:none;color:#fff;cursor:pointer;font-size:12px;padding:0 2px;">✕</button>';
    b.querySelector('#tmh-badge-close').addEventListener('click', () => b.remove());
    document.body.appendChild(b);
  }
  function setBadge(text) {
    ensureBadge();
    const s = document.getElementById('tmh-badge-status');
    if (s) s.textContent = text;
  }

  // ---------- 按钮注入 ----------
  function addButton(el, address) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tmh-map-btn';
    btn.title = '在地图上查看该收货地址';
    btn.textContent = '📍 地图';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal(address);
    });
    el.appendChild(btn);
  }

  function scan(root) {
    let els;
    try { els = collectAddressEls(root); } catch (err) { return; }
    let added = 0;
    for (const el of els) {
      if (processed.has(el)) continue;
      processed.add(el);
      const addr = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (looksLikeAddress(addr)) { addButton(el, addr); added++; foundCount++; }
    }
    if (added) setBadge('已识别 ' + foundCount + ' 个地址');
  }

  // ---------- 弹窗地图 ----------
  let activeModal = null;
  function closeModal() {
    if (activeModal) { activeModal.remove(); activeModal = null; }
  }
  function makeDraggable(panel, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.tmh-close-btn')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      ox = 0; oy = 0;
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(panel.style.transform || '');
      if (m) { ox = parseFloat(m[1]); oy = parseFloat(m[2]); }
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      // 用 transform 平移，避免静态/flex 布局下 left/top 失效
      panel.style.transform = 'translate(' + (ox + e.clientX - sx) + 'px, ' + (oy + e.clientY - sy) + 'px)';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }
  function openModal(address) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'tmh-overlay';
    const panel = document.createElement('div');
    panel.className = 'tmh-panel';
    const head = document.createElement('div');
    head.className = 'tmh-panel-head';
    const title = document.createElement('span');
    title.className = 'tmh-panel-title';
    title.textContent = '📍 收货地址地图';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tmh-close-btn';
    closeBtn.title = '关闭';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeModal);
    head.appendChild(title);
    head.appendChild(closeBtn);
    const iframe = document.createElement('iframe');
    iframe.className = 'tmh-iframe';
    iframe.src = EXT_URL + 'map.html?addr=' + encodeURIComponent(address);
    iframe.title = '收货地址地图';
    panel.appendChild(head);
    panel.appendChild(iframe);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
    activeModal = overlay;
    makeDraggable(panel, head);
  }

  // ---------- 监听动态加载 ----------
  let schedule = null;
  function kick() {
    if (schedule) return;
    schedule = setTimeout(() => { schedule = null; scan(document.body); }, 300);
  }
  const mo = new MutationObserver((muts) => {
    for (const m of muts) { if (m.addedNodes && m.addedNodes.length) { kick(); return; } }
  });
  try { mo.observe(document.body, { childList: true, subtree: true }); } catch (e) {}

  // 兜底：定时扫描（覆盖分页/异步渲染/shadow 内部变化）
  const timer = setInterval(() => { try { scan(document.body); } catch (e) {} }, 2500);
  window.addEventListener('pagehide', () => clearInterval(timer));

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  ensureBadge();
  setBadge('已激活');
  if (document.body) scan(document.body);
  else document.addEventListener('DOMContentLoaded', () => { scan(document.body); ensureBadge(); });
})();
