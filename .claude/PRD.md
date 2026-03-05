# PRD: btcmine-diff -- BTC 难度预测平台

**项目路径**: `/Users/leogrossman/btcmine-diff/`
**线上地址**: https://diff.btcmine.info
**最后更新**: 2026-03-06

---

## 1. Executive Summary

btcmine-diff 是一个纯前端静态网站，基于供需均衡经济学模型预测比特币挖矿难度，覆盖未来 12 个月（约 26 个 Epoch）。用户可自定义 BTC 价格路径、电费、ASIC 效率等参数，实时计算均衡算力与难度预测曲线。支持牛市/基准/熊市三情景对比分析。通过 GitHub Pages 部署，域名 `diff.btcmine.info`。

---

## 2. Mission

为矿工、矿场运营商、算力交易者和投资者提供透明、可交互的比特币难度预测工具，帮助其基于经济学模型做出挖矿决策——包括设备采购、电力合约、算力对冲等。

---

## 3. Core Features

### 3.1 实时网络状态概览

- 当前难度（T 级显示 + 完整数值）
- 全网算力（EH/s，24h 均值）
- 区块高度及最新出块时间
- 下次难度调整预估（百分比变化）
- 区块奖励（当前 3.125 BTC，含减半标注）
- Hashprice（USD/TH/day）
- BTC 实时价格 + 24h 涨跌幅

### 3.2 历史数据可视化

- 历史难度曲线（2 年，时间序列图）
- 历史算力曲线（2 年，时间序列图）
- 数据来源：mempool.space API（2y hashrate/difficulty）

### 3.3 交互式难度预测

- 9 个可调参数：
  - 当前/目标 BTC 价格
  - 价格路径（线性/先涨后平/先平后涨/冲高回落）
  - 电费（$/kWh）
  - ASIC 效率（当前/年末 J/TH）
  - 矿工利润率
  - Epoch 最大增长率
  - 预测月数（3-24）
- 输出：
  - 难度 + BTC 价格双轴图
  - 算力 + Hashprice 双轴图
  - 逐 Epoch 数据表（日期/价格/难度/算力/Hashprice/ASIC 效率/矿工成本）

### 3.4 三情景对比分析

| 情景 | BTC 终值倍数 | 价格路径 | Epoch 增长上限 | 手续费收入 |
|------|------------|---------|-------------|----------|
| 牛市 | 2.0x | front-loaded | 6%/epoch | $3M/day |
| 基准 | 1.3x | linear | 4%/epoch | $1.5M/day |
| 熊市 | 0.6x | front-loaded | 2%/epoch | $0.5M/day |

- 三线对比图（难度/算力/价格各一张）
- 情景摘要卡片（终值、变化百分比）
- 情景终值对比表

### 3.5 模型说明页

- 供需均衡框架公式推导
- 增长约束机制
- 关键假设（价格路径、ASIC 效率、电费、利润率）
- 参考文献（Hashrate Index, Bitcoin Magazine, ScienceDirect）

### 3.6 多语言 & 主题

- 中英双语切换（i18n 对象映射）
- 明暗主题切换
- 响应式布局（手机/平板/桌面）

---

## 4. Architecture & Directory Structure

```
btcmine-diff/
├── index.html              # 单页应用主入口（376 行）
├── css/
│   └── style.css           # 完整样式（648 行），含暗/亮主题变量
├── js/
│   ├── model.js            # 供需均衡模型核心（285 行）
│   │   └── DifficultyModel  (IIFE 模块)
│   │       ├── runForecast()         # 单情景预测
│   │       ├── multiScenario()       # 三情景生成
│   │       ├── interpolatePrice()    # 价格路径插值
│   │       ├── hashrateToDifficulty()
│   │       ├── difficultyToHashrate()
│   │       └── getDefaults()         # 默认参数
│   ├── data.js             # 数据获取层（108 行）
│   │   └── DataLoader (IIFE 模块)
│   │       ├── fetchMempoolMining()  # mempool.space 2y 数据
│   │       ├── fetchBtcPrice()       # CoinGecko 实时价格
│   │       ├── fetchNetworkStats()   # Blockchair 网络状态
│   │       └── loadAll()             # 并行加载
│   └── app.js              # 主应用逻辑（642 行）
│       ├── 导航/主题/语言切换
│       ├── 数据渲染（stats/charts/tables）
│       ├── Chart.js 图表管理（6 张图）
│       └── 自动运行预测 + 情景分析
├── CNAME                   # diff.btcmine.info
├── .gitignore
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Pages 自动部署
```

**技术栈**:
- 纯 HTML/CSS/JavaScript，零构建依赖
- Chart.js 4.4.0 + date-fns adapter + annotation plugin
- Google Fonts: Inter + JetBrains Mono

---

## 5. Data Sources

| 数据 | API | 端点 | 用途 |
|------|-----|------|------|
| 难度 + 算力历史 | mempool.space | `/api/v1/mining/hashrate/2y` | 2 年历史图 + 当前值 |
| BTC 实时价格 | CoinGecko | `/api/v3/simple/price` | 头部价格显示 + 模型输入 |
| 网络统计 | Blockchair | `/bitcoin/stats` | 难度/算力/区块高度/下次调整 |

- 所有请求 15 秒超时，AbortController 取消
- Promise.allSettled 并行加载，部分失败不影响其他
- 状态指示器：LOADING → LIVE/OFFLINE/ERROR

---

## 6. Model Details

### 6.1 核心公式

**需求侧（矿工日收入）**:
```
daily_revenue = block_reward × 144 × btc_price + daily_fees
```

**供给侧（单位算力日成本）**:
```
cost_per_TH_day = asic_efficiency(J/TH) × 86400 / 1e9 × electricity_rate($/kWh)
```

**均衡算力（目标利润率下）**:
```
equilibrium_hashrate = daily_revenue / (cost_per_TH_day / (1 - margin))
```

**难度转换（确定性映射）**:
```
difficulty = hashrate(H/s) × 600 / 2^32
```

### 6.2 增长约束

算力不可瞬间跳到均衡值，受 ASIC 制造/部署/基建限制：
```
hashrate[t] = clamp(equilibrium,
                     hashrate[t-1] × (1 + max_decline),
                     hashrate[t-1] × (1 + max_growth))
```
- 默认 max_growth = +4%/epoch, max_decline = -5%/epoch

### 6.3 价格路径插值

| 路径类型 | 插值函数 | 特征 |
|---------|---------|------|
| linear | `t` | 匀速变化 |
| front-loaded | `1 - (1-t)^2` | 先涨后平 |
| back-loaded | `t^2` | 先平后涨 |
| cycle | `4t(1-t)` | 冲高回落，t=0.5 时峰值 |

### 6.4 减半日程

```javascript
{ block: 840000,  reward: 3.125 },   // 2024.04 (当前)
{ block: 1050000, reward: 1.5625 },  // ~2028
```
当前近似区块高度：885,000（2026 年 3 月）

### 6.5 默认参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| currentDifficulty | 114.17T | 当前难度 |
| currentHashrateEH | 850 | 全网算力 EH/s |
| currentBtcPrice | $86,000 | 当前 BTC 价格 |
| electricityRate | $0.055/kWh | 全球加权平均电价 |
| asicEfficiencyNow | 21.5 J/TH | 当前矿机舰队效率 |
| asicEfficiencyEnd | 15.0 J/TH | 年末预期效率 |
| minerMargin | 40% | 含 capex/托管/运营 |
| dailyFeesUSD | $1.5M | 日均手续费收入 |
| forecastMonths | 12 | 预测期 |

---

## 7. UI / Visualization

### 7.1 页面结构（SPA 四页签）

1. **概览** (overview) — 网络状态 + 历史图表
2. **难度预测** (forecast) — 参数面板 + 预测图表 + 数据表
3. **情景分析** (scenarios) — 三情景卡片 + 对比图表 + 对比表
4. **模型说明** (methodology) — 公式推导 + 假设说明

### 7.2 图表列表（6 张 Chart.js 图表）

| 图表 | 类型 | 轴 | 位置 |
|------|------|-----|------|
| chartHistorical | 线图 | 难度(T) vs 时间 | 概览 |
| chartHashrate | 线图 | 算力(EH/s) vs 时间 | 概览 |
| chartForecastDiff | 双轴线图 | 难度(T) + BTC 价格 | 预测 |
| chartForecastHash | 双轴线图 | 算力(EH/s) + Hashprice | 预测 |
| chartScenarios | 三线对比 | 难度(T) × 3 情景 | 情景 |
| chartScenariosHash | 三线对比 | 算力(EH/s) × 3 情景 | 情景 |
| chartScenariosPrice | 三线对比 | BTC 价格 × 3 情景 | 情景 |

### 7.3 设计系统

- **暗色主题**（默认）：`#080808` 背景，参考 btcmine.info 风格
- **亮色主题**：`#f5f5f7` 背景
- **品牌色**：BTC 橙 `#f59e0b`，蓝 `#3b82f6`，绿 `#10b981`，红 `#ef4444`
- **字体**：Inter（正文）+ JetBrains Mono（数据）
- **断点**：900px（隐藏导航 tab），600px（单列）

---

## 8. Deployment

- **平台**: GitHub Pages
- **域名**: `diff.btcmine.info`（CNAME 文件）
- **CI/CD**: `.github/workflows/deploy.yml`
  - 触发条件：push to `main` 或手动触发
  - 步骤：checkout → configure-pages → upload-artifact → deploy-pages
- **无构建步骤**：直接部署整个仓库根目录
- **依赖**：零服务端依赖，所有数据 API 均为公开 CORS 接口

---

## 9. Success Criteria

| 指标 | 目标 | 衡量方式 |
|------|------|---------|
| 页面加载 | < 2s (FCP) | 纯静态 + CDN |
| API 可用性 | 3 个数据源中至少 1 个可用 | Promise.allSettled 容错 |
| 模型精度 | 下次难度调整预估误差 < 5% | 与实际调整值对比 |
| 情景覆盖 | 牛/基/熊三线包围实际走势 | 历史回测 |
| 双语支持 | 中英完整覆盖 | i18n 对象全映射 |
| 移动适配 | 600px-1400px 正常显示 | 响应式 CSS |

---

## 10. Future Considerations

1. **历史回测验证**：将模型预测与过去 2 年实际难度调整对比，量化准确度
2. **更多价格路径**：支持用户自定义分段价格（如先涨后跌再涨的 W 形）
3. **手续费模型**：目前固定值，可引入动态手续费预测（基于 mempool 活跃度）
4. **矿机库存模型**：分代矿机（S19/S21/S21XP）分别建模，而非单一加权效率
5. **API 端点**：提供 JSON API 供 btcmine.info 主站直接嵌入难度预测数据
6. **PWA 支持**：Service Worker 离线缓存，支持移动端添加到主屏幕
7. **Hashprice 预测**：单独出 Hashprice 预测图表，矿工最关心的收入指标
8. **减半倒计时**：可视化到下次减半（~2028）的进度条，标注对难度的影响
9. **与 btcmine.info 主站整合**：统一导航栏，共享 BTC 价格组件
10. **DataCentre 数据源**：可考虑用自有数据中心采集链上数据，减少对第三方 API 依赖
