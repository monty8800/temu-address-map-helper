# Temu 地址地图助手 (Temu Address Map Helper)

> 在 Temu 订单后台的每条订单**收货地址**旁注入一个「📍 地图」按钮，点击弹出**中文小地图**定位该地址，帮助运营人员发货时快速判断目的地与物流渠道。
> A lightweight Chrome (Manifest V3) extension that adds a map button next to every recipient address on Temu order pages, showing a localized mini-map of the destination to help pick the right logistics route.

**状态：** 已在 Temu Seller Center / Agent Center 的订单与发货页面实测可用

**作者：** MONTY（优必特 YOBTOP）

---

## ✨ 功能特性

- **一键地图**：每条订单收货地址旁自动出现「📍 地图」按钮，点击即弹出小地图。
- **中文地名**：地图使用高德（AutoNavi）中文瓦片，州/城市名以中文显示（如「波士顿」「威斯康星州」）。
- **自动定位**：通过开放地理编码（Nominatim 主 / Photon 备）解析地址，出现红色定位标记。
- **区域视图**：默认定位到收货地附近（约 6 级缩放，可看清所在州/区域）；「**全国**」按钮一键缩放到整个国家（美国即全美）。
- **可拖动弹窗**：可拖动标题栏移动，✕ / Esc / 点遮罩关闭。
- **智能识别**：自动识别美国/英国/加拿大/欧洲等地址格式，订单异步加载/分页也能自动注入按钮。
- **自包含**：Leaflet 已本地打包，不依赖外网 CDN，无需任何 API Key。
- **私密**：仅本地运行，不上传任何订单数据；仅在定位时把该单地址发给地图服务解析坐标。

## 🌐 支持的页面

匹配 `https://*.temu.com/*` 下所有展示收货地址的订单 / 发货页面：

- `https://agentseller-up.temu.com/mmcs/orders.orders`
- `https://agentseller-us.temu.com/mmsos/orders.html`
- `https://agentseller-us.temu.com/mmsos/online-shipment.html`
- 以及其他 `*.temu.com` 上的订单 / 发货页面

## 🖼️ 界面示意

点击「📍 地图」后，弹出小地图弹窗：
- 顶部：收货地址原文 + 「复制」按钮
- 中间：中文地图 + 红色定位标记
- 底部：定位状态、OSM / Google 地图、放大、全国

## 🚀 安装方法（Chrome / Edge）

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）。
2. 打开右上角 **开发者模式**。
3. 点击 **加载已解压的扩展程序**（Load unpacked），选择本项目文件夹（含 `manifest.json`）。
4. 安装成功后刷新 Temu 订单后台页面。

> 代码改动后，需在扩展页点「重新加载」刷新扩展，并强刷页面（Cmd/Ctrl+Shift+R）。

## 🧭 使用方法

1. 打开 Temu 订单后台，每条订单**收货地址**旁会出现「📍 地图」按钮。
2. 点击按钮弹出小地图并自动定位该地址。
3. 地图默认显示收货地附近（中文地名）；用 **+ / −** 或**滚轮**缩放，点红色定位标记看详情，点「**全国**」看全美。
4. 弹窗可**拖动标题栏**移动，✕ / Esc / 点遮罩关闭。

> 页面分页/异步加载的订单会自动识别并注入按钮，无需手动刷新。

## 🛠️ 技术栈

- **扩展类型**：Chrome Manifest V3
- **地图引擎**：Leaflet 1.9.4（本地打包）
- **底图**：高德地图（AutoNavi）中文瓦片，`style=7`
- **地址定位**：Nominatim（OpenStreetMap）为主，Photon（Komoot）兜底
- **坐标**：高德（GCJ-02），全国/区域视图下与 OpenStreetMap（WGS-84）坐标差异可忽略；街道级可能略有偏移。

## 📁 项目结构

```
temu-shipping-map-helper/
├── manifest.json          # Manifest V3 配置
├── content/
│   ├── content.js         # 内容脚本：地址识别 + 注入按钮 + 弹窗
│   └── content.css        # 按钮与弹窗样式
├── map.html               # 小地图页面（iframe 加载的扩展页）
├── map/
│   ├── map.js             # 地理编码 + Leaflet 地图渲染
│   └── map.css            # 小地图页面样式
├── lib/                   # 本地打包的 Leaflet 库
│   ├── leaflet.js
│   ├── leaflet.css
│   └── images/            # 地图 Marker 图标等
└── icons/                 # 扩展图标（16/48/128）
```

## ❓ 常见问题

- **按钮没出现？** 确认强刷页面；若订单网格在站点内嵌 iframe 里，需在 `manifest.json` 的 `content_scripts` 中加 `"all_frames": true` 后重载扩展。
- **地图空白？** 极少数站点会用 CSP 限制 iframe 加载扩展页，可反馈以切换为内容脚本内部渲染方案。
- **定位不准确？** 列表只显示「城市, 州 邮编, 国家」，个别小城市可能无法精确到街道；可点「Google 地图」核对。
- **定位太慢？** Nominatim 免费接口有 1 次/秒限流，批量查看请稍等；已内置 Photon 兜底。
- **调试角标？** 页面右下角会显示「📍 地图助手」角标及已识别地址数，用于排查（确认正常后点 ✕ 关闭）。

## 🔒 数据与隐私

- 扩展**仅在本地**运行，不向任何服务器上传订单数据。
- 仅在地图定位时，把**该单收货地址**发送给 OpenStreetMap（Nominatim/Photon）解析坐标；这是地图服务的必要调用。
- 不含任何统计、广告或第三方 SDK。

## ⚖️ 免责声明

本项目为运营辅助工具，与 Temu、高德地图、OpenStreetMap、Komoot 均无任何隶属或合作关系。请遵守相关平台的使用条款与当地法律法规。

## 📄 许可证

[MIT](LICENSE)
