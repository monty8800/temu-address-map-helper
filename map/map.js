/* Temu 地址地图助手 - 小地图页面逻辑 v1.6
 * 通过查询参数 ?addr=<收货地址> 加载，用 Nominatim（主）/ Photon（备）地理编码，
 * 在 Leaflet + 高德(AutoNavi)中文瓦片(style=7 带中文地名)上定位并展示地址。
 * 默认定位到目的地附近(可见中文地名与所在区域)，「全国」按钮可一键看全美。 */
(() => {
  const params = new URLSearchParams(location.search);
  const address = (params.get('addr') || '').trim();

  const addrBox = document.getElementById('addrBox');
  const statusBox = document.getElementById('statusBox');
  const copyBtn = document.getElementById('copyBtn');
  const hintBox = document.getElementById('hintBox');
  const osmLink = document.getElementById('osmSearchLink');
  const gmapLink = document.getElementById('gmapLink');
  const fullLink = document.getElementById('fullLink');
  const countryBtn = document.getElementById('countryBtn');

  addrBox.textContent = address || '（未提供地址）';
  let map = null;
  let marker = null;
  let curLat = null;
  let curLon = null;

  // 常见国家/地区边界（用于「全国」按钮缩放到整个国家）
  const COUNTRY_BBOX = [
    { names: ['united states', 'usa', 'u.s.a.'], bbox: [[24.4, 49.5], [-124.8, -66.9]] },
    { names: ['united kingdom', 'great britain'], bbox: [[49.8, 58.7], [-8.7, 1.8]] },
    { names: ['canada'], bbox: [[41.7, 74.7], [-141.0, -52.0]] },
    { names: ['australia'], bbox: [[-43.6, -10.7], [112.0, 153.6]] },
    { names: ['germany'], bbox: [[47.2, 55.1], [5.9, 15.0]] },
    { names: ['france'], bbox: [[41.3, 51.1], [-5.1, 9.6]] },
    { names: ['italy'], bbox: [[35.5, 47.1], [6.6, 18.5]] },
    { names: ['spain'], bbox: [[36.0, 43.8], [-9.3, 3.3]] },
    { names: ['netherlands'], bbox: [[50.7, 53.6], [3.2, 7.2]] },
    { names: ['poland'], bbox: [[49.0, 54.8], [14.1, 24.2]] },
    { names: ['mexico'], bbox: [[14.5, 32.7], [-118.4, -86.7]] },
    { names: ['japan'], bbox: [[24.0, 45.5], [122.9, 146.0]] },
    { names: ['brazil'], bbox: [[-33.7, 5.3], [-73.9, -34.8]] },
    { names: ['new zealand'], bbox: [[-47.3, -34.4], [166.0, 178.6]] }
  ];
  function getCountryBBox(addr) {
    const s = (addr || '').toLowerCase();
    for (const c of COUNTRY_BBOX) {
      if (c.names.some((n) => s.includes(n))) return c.bbox;
    }
    return null;
  }

  function setStatus(msg, cls) {
    statusBox.textContent = msg;
    statusBox.className = 'mh-status' + (cls ? ' ' + cls : '');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function iconPath() {
    const p = chrome.runtime.getURL('lib/images/');
    return { iconUrl: p + 'marker-icon.png', iconRetinaUrl: p + 'marker-icon-2x.png', shadowUrl: p + 'marker-shadow.png' };
  }

  function initMap() {
    map = L.map('map', { scrollWheelZoom: true, doubleClickZoom: true, zoomControl: true, attributionControl: true, maxZoom: 18 });
    // 高德中文瓦片：style=7 为带中文地名标准地图
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}', {
      maxZoom: 18,
      subdomains: '1234',
      attribution: '© 高德地图 AutoNavi'
    }).addTo(map);
  }

  function showResult(lat, lon, bbox, label) {
    curLat = lat; curLon = lon;
    setStatus('已定位', 'ok');
    hintBox.textContent = label && label.length > 90 ? label.slice(0, 90) + '…' : (label || '');
    if (!map) initMap();
    const icon = L.icon(Object.assign({ iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }, iconPath()));
    if (marker) marker.remove();
    marker = L.marker([lat, lon], { icon }).addTo(map);
    marker.bindPopup('<b>' + escapeHtml(label || address) + '</b>');
    // 默认定位到目的地附近（区域视图，可见中文地名），可再用「全国」看全美
    map.setView([lat, lon], 6);
  }

  function fitCountry() {
    if (!map) initMap();
    const cbox = getCountryBBox(address);
    if (cbox) {
      map.fitBounds(cbox, { padding: [14, 14] });
    } else if (curLat != null) {
      map.setView([curLat, curLon], 4);
    }
  }

  function showError(msg) {
    setStatus(msg, 'err');
    hintBox.textContent = '';
    if (!map) { initMap(); map.setView([20, 0], 2); }
  }

  async function geocodeNominatim(addr) {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=zh&q=' + encodeURIComponent(addr);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data && data.length) {
      const it = data[0];
      return {
        lat: parseFloat(it.lat),
        lon: parseFloat(it.lon),
        bbox: it.boundingbox ? it.boundingbox.map(Number) : null,
        label: it.display_name || addr
      };
    }
    return null;
  }

  async function geocodePhoton(addr) {
    const url = 'https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(addr);
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.features && data.features.length) {
      const f = data.features[0];
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties || {};
      const label = [p.name, p.city, p.state, p.country].filter(Boolean).join(', ') || addr;
      let bbox = null;
      if (f.bbox && f.bbox.length === 4) bbox = [f.bbox[1], f.bbox[3], f.bbox[0], f.bbox[2]];
      return { lat, lon, bbox, label };
    }
    return null;
  }

  async function run() {
    if (!address) { showError('未提供地址，无法定位'); return; }
    let result = null;
    try { result = await geocodeNominatim(address); } catch (e) {}
    if (!result) {
      try { result = await geocodePhoton(address); } catch (e) {}
    }
    if (result) {
      showResult(result.lat, result.lon, result.bbox, result.label);
    } else {
      showError('未能通过开放地图定位该地址（可能地址不完整）。可点击下方 Google 地图查看。');
    }
  }

  // 复制地址：优先用 execCommand，避免 iframe 内 clipboard-write 权限策略拦截；失败再退回 Clipboard API
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }
  copyBtn.addEventListener('click', async () => {
    let ok = false;
    if (fallbackCopy(address)) {
      ok = true;
    } else {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(address);
          ok = true;
        }
      } catch (e) {}
    }
    copyBtn.textContent = ok ? '已复制' : '复制失败';
    setTimeout(() => { copyBtn.textContent = '复制'; }, 1200);
  });

  if (countryBtn) {
    countryBtn.addEventListener('click', () => fitCountry());
  }

  osmLink.href = 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(address);
  gmapLink.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
  const fullUrl = new URL(location.href);
  fullUrl.searchParams.set('full', '1');
  fullLink.href = fullUrl.toString();

  run();
})();
