/**
 * BTC Difficulty Forecast — Main Application
 */

(async function () {
  'use strict';

  // ── Chart.js global config ──────────────────────────────
  Chart.defaults.color = '#a0a0a0';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.display = false;

  const charts = {};
  let lang = 'zh';
  let scenarioResults = null;
  let data = null;

  // ── Navigation ──────────────────────────────────────────
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('page-' + tab.dataset.page).classList.add('active');
    });
  });

  // ── Theme toggle ────────────────────────────────────────
  const themeBtn = document.getElementById('themeToggle');
  themeBtn.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    document.documentElement.setAttribute('data-theme', isLight ? '' : 'light');
    themeBtn.textContent = isLight ? '☀' : '☾';
    updateChartColors();
  });

  // ── Language toggle ─────────────────────────────────────
  const langBtn = document.getElementById('langToggle');
  langBtn.addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    langBtn.textContent = lang === 'zh' ? 'EN' : '中';
    applyLang();
    // Re-render scenario if available
    if (scenarioResults) {
      try { renderScenarioSummary(); renderScenarioTable(); } catch(e) {}
    }
  });

  const i18n = {
    introTitle: { zh: '关于本站', en: 'About' },
    introText: {
      zh: '本平台基于供需均衡模型预测比特币挖矿难度，覆盖未来 12 个月。模型综合 BTC 价格路径、ASIC 产能与效率趋势、全网电力成本、区块补贴减半等因素，输出均衡算力与难度预测。支持牛市/基准/熊市三种情景对比。',
      en: 'This platform forecasts Bitcoin mining difficulty using a supply-demand equilibrium model, covering the next 12 months. The model integrates BTC price paths, ASIC capacity & efficiency trends, global electricity costs, and halving schedules to project equilibrium hashrate and difficulty under bull/base/bear scenarios.'
    },
    lblCurrentStats: { zh: '当前网络状态', en: 'Current Network Status' },
    lblDifficulty: { zh: '当前难度', en: 'Current Difficulty' },
    lblHashrate: { zh: '全网算力', en: 'Network Hashrate' },
    lblBlockHeight: { zh: '区块高度', en: 'Block Height' },
    lblNextAdj: { zh: '下次调整预估', en: 'Next Adjustment Est.' },
    lblBlockReward: { zh: '区块奖励', en: 'Block Reward' },
    lblHashprice: { zh: 'Hashprice', en: 'Hashprice' },
    chartHistTitle: { zh: '历史难度（2年）', en: 'Historical Difficulty (2Y)' },
    chartHashrateTitle: { zh: '历史算力（2年）', en: 'Historical Hashrate (2Y)' },
    lblForecast: { zh: '难度预测 — 12个月', en: 'Difficulty Forecast — 12 Months' },
    lblParams: { zh: '模型参数', en: 'Model Parameters' },
    lblPriceCurr: { zh: '当前 BTC 价格 (USD)', en: 'Current BTC Price (USD)' },
    lblPriceEnd: { zh: '目标 BTC 价格 (USD)', en: 'Target BTC Price (USD)' },
    lblPricePath: { zh: '价格路径', en: 'Price Path' },
    lblElectricity: { zh: '电费 ($/kWh)', en: 'Electricity ($/kWh)' },
    lblAsicNow: { zh: '当前 ASIC 效率 (J/TH)', en: 'Current ASIC Efficiency (J/TH)' },
    lblAsicEnd: { zh: '年末 ASIC 效率 (J/TH)', en: 'Year-End ASIC Efficiency (J/TH)' },
    lblMargin: { zh: '矿工利润率', en: 'Miner Margin' },
    lblMaxGrowth: { zh: 'Epoch 最大增长率', en: 'Max Epoch Growth' },
    lblMonths: { zh: '预测月数', en: 'Forecast Months' },
    chartFcTitle: { zh: '难度预测曲线', en: 'Difficulty Forecast Curve' },
    chartFcHash: { zh: '算力 & Hashprice 预测', en: 'Hashrate & Hashprice Forecast' },
    tblFcTitle: { zh: '逐 Epoch 预测数据', en: 'Per-Epoch Forecast Data' },
    lblScenarios: { zh: '三情景对比分析', en: 'Three-Scenario Analysis' },
    scenSubtitle: { zh: '牛市、基准、熊市情景下的难度预测对比。基于当前网络参数，未来 12 个月。', en: 'Difficulty forecast comparison under bull, base, and bear scenarios. Based on current network parameters, next 12 months.' },
    chartScenDiff: { zh: '难度预测 — 三情景对比', en: 'Difficulty Forecast — 3 Scenarios' },
    chartScenHash: { zh: '算力预测 — 三情景对比', en: 'Hashrate Forecast — 3 Scenarios' },
    chartScenPrice: { zh: 'BTC 价格路径 — 三情景', en: 'BTC Price Path — 3 Scenarios' },
    tblScenTitle: { zh: '情景终值对比', en: 'Scenario End-State Comparison' },
    lblMethod: { zh: '模型说明', en: 'Methodology' },
  };

  function applyLang() {
    for (const [id, texts] of Object.entries(i18n)) {
      const el = document.getElementById(id);
      if (el) el.textContent = texts[lang];
    }
  }

  // ── Helpers ─────────────────────────────────────────────
  function fmt(n, decimals = 0) {
    if (n == null || isNaN(n)) return '--';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function fmtT(n) {
    if (n == null || isNaN(n)) return '--';
    return (Number(n) / 1e12).toFixed(2) + ' T';
  }

  function fmtEH(n) {
    if (n == null || isNaN(n)) return '--';
    return Number(n).toFixed(1) + ' EH/s';
  }

  function getChartTextColor() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? '#52525b' : '#a0a0a0';
  }

  function getChartGridColor() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? '#e2e2e5' : '#1e1e1e';
  }

  function updateChartColors() {
    const textColor = getChartTextColor();
    const gridColor = getChartGridColor();
    for (const chart of Object.values(charts)) {
      if (!chart) continue;
      Chart.defaults.color = textColor;
      if (chart.options && chart.options.scales) {
        for (const axis of Object.values(chart.options.scales)) {
          if (axis.ticks) axis.ticks.color = textColor;
          if (axis.grid) axis.grid.color = gridColor;
        }
      }
      chart.update('none');
    }
  }

  function setStatus(text, color) {
    const el = document.getElementById('statusBadge');
    if (el) { el.textContent = text; el.style.color = color; }
  }

  // ── Load data ───────────────────────────────────────────
  try {
    setStatus('LOADING', 'var(--orange)');
    data = await DataLoader.loadAll();
    const hasAny = data.difficulty || data.btcPrice || data.networkStats || data.hashrate;
    setStatus(hasAny ? 'LIVE' : 'OFFLINE', hasAny ? 'var(--green)' : 'var(--red)');
  } catch (e) {
    console.error('[App] loadAll failed:', e);
    setStatus('ERROR', 'var(--red)');
    data = { difficulty: null, btcPrice: null, networkStats: null, hashrate: null };
  }

  // ── BTC price ───────────────────────────────────────────
  try {
    if (data.btcPrice) {
      document.getElementById('btcPrice').textContent = '$' + fmt(data.btcPrice.price);
      const changeEl = document.getElementById('btcChange');
      const ch = data.btcPrice.change24h || 0;
      changeEl.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%';
      changeEl.className = ch >= 0 ? 'btc-change-pos' : 'btc-change-neg';
      document.getElementById('paramBtcPrice').value = Math.round(data.btcPrice.price);
    }
  } catch (e) { console.warn('[App] BTC price render error:', e); }

  // ── Network stats ───────────────────────────────────────
  try {
    if (data.networkStats) {
      const ns = data.networkStats;
      document.getElementById('statDifficulty').textContent = fmtT(ns.difficulty);
      document.getElementById('statDiffSub').textContent = fmt(ns.difficulty);
      document.getElementById('statHashrate').textContent = fmtEH(ns.hashrateEH);
      document.getElementById('statBlockHeight').textContent = fmt(ns.blockHeight);
      document.getElementById('statBlockSub').textContent = ns.bestBlockTime || '--';

      if (ns.nextDifficultyEstimate) {
        const change = ((ns.nextDifficultyEstimate - ns.difficulty) / ns.difficulty * 100);
        document.getElementById('statNextAdj').textContent = fmtT(ns.nextDifficultyEstimate);
        const subEl = document.getElementById('statNextAdjSub');
        subEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
        subEl.style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
      }

      // Hashprice = daily_revenue_per_TH
      const btcPrice = data.btcPrice ? data.btcPrice.price : 69000;
      if (ns.hashrateEH > 0) {
        const dailyRev = 3.125 * 144 * btcPrice;
        const hashrateTH = ns.hashrateEH * 1e6;
        const hashprice = dailyRev / hashrateTH;
        document.getElementById('statHashprice').textContent = '$' + hashprice.toFixed(4);
      }
    }
  } catch (e) { console.warn('[App] Network stats render error:', e); }

  // ── Historical Difficulty Chart ─────────────────────────
  try {
    if (data.difficulty && data.difficulty.length > 1) {
      const ctx = document.getElementById('chartHistorical').getContext('2d');
      charts.historical = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.difficulty.map(d => d.date),
          datasets: [{
            data: data.difficulty.map(d => d.difficultyT),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.08)',
            fill: true,
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              type: 'time',
              time: { unit: 'month', displayFormats: { month: 'yyyy-MM' } },
              grid: { color: getChartGridColor() },
              ticks: { color: getChartTextColor(), maxTicksLimit: 12 },
            },
            y: {
              title: { display: true, text: 'Difficulty (T)', color: getChartTextColor() },
              grid: { color: getChartGridColor() },
              ticks: { color: getChartTextColor(), callback: v => v.toFixed(0) + 'T' },
            }
          },
          plugins: {
            tooltip: { callbacks: { label: c => 'Difficulty: ' + c.parsed.y.toFixed(2) + ' T' } }
          }
        }
      });
    }
  } catch (e) { console.warn('[App] Historical difficulty chart error:', e); }

  // ── Historical Hashrate Chart ───────────────────────────
  try {
    if (data.hashrate && data.hashrate.length > 1) {
      const ctx = document.getElementById('chartHashrate').getContext('2d');
      charts.hashrate = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.hashrate.map(d => d.date),
          datasets: [{
            data: data.hashrate.map(d => d.hashrateEH),
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6,182,212,0.08)',
            fill: true,
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              type: 'time',
              time: { unit: 'month', displayFormats: { month: 'yyyy-MM' } },
              grid: { color: getChartGridColor() },
              ticks: { color: getChartTextColor(), maxTicksLimit: 12 },
            },
            y: {
              title: { display: true, text: 'Hashrate (EH/s)', color: getChartTextColor() },
              grid: { color: getChartGridColor() },
              ticks: { color: getChartTextColor(), callback: v => v.toFixed(0) },
            }
          },
          plugins: {
            tooltip: { callbacks: { label: c => 'Hashrate: ' + c.parsed.y.toFixed(1) + ' EH/s' } }
          }
        }
      });
    }
  } catch (e) { console.warn('[App] Historical hashrate chart error:', e); }

  // ── Forecast ────────────────────────────────────────────
  document.getElementById('btnRunForecast').addEventListener('click', runCustomForecast);

  function getParams() {
    const ns = data && data.networkStats;
    const price = data && data.btcPrice;
    return {
      currentDifficulty: ns ? ns.difficulty : 144e12,
      currentHashrateEH: ns ? ns.hashrateEH : 950,
      currentBtcPrice: parseFloat(document.getElementById('paramBtcPrice').value) || (price ? price.price : 69000),
      currentDate: new Date(),
      currentBlockHeight: ns ? ns.blockHeight : 939000,
      btcPriceEnd: parseFloat(document.getElementById('paramBtcPriceEnd').value) || 120000,
      btcPricePath: document.getElementById('paramPricePath').value,
      electricityRate: parseFloat(document.getElementById('paramElectricity').value) || 0.055,
      asicEfficiencyNow: parseFloat(document.getElementById('paramAsicNow').value) || 21.5,
      asicEfficiencyEnd: parseFloat(document.getElementById('paramAsicEnd').value) || 15.0,
      minerMargin: parseFloat(document.getElementById('paramMargin').value) || 0.40,
      maxEpochGrowth: parseFloat(document.getElementById('paramMaxGrowth').value) || 0.04,
      maxEpochDecline: -0.05,
      forecastMonths: parseInt(document.getElementById('paramMonths').value) || 12,
      dailyFeesUSD: 1500000,
    };
  }

  function runCustomForecast() {
    try {
      const params = getParams();
      const result = DifficultyModel.runForecast(params);
      renderForecastCharts(result);
      renderForecastTable(result);
    } catch (e) { console.error('[App] Forecast error:', e); }
  }

  function renderForecastCharts(result) {
    // Difficulty + Price dual-axis chart
    if (charts.fcDiff) charts.fcDiff.destroy();
    const ctx1 = document.getElementById('chartForecastDiff').getContext('2d');
    charts.fcDiff = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: result.map(r => r.date),
        datasets: [
          {
            label: lang === 'zh' ? '难度 (T)' : 'Difficulty (T)',
            data: result.map(r => r.difficultyT),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.08)',
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2,
            tension: 0.3,
            yAxisID: 'y',
          },
          {
            label: 'BTC Price',
            data: result.map(r => r.btcPrice),
            borderColor: '#f59e0b',
            borderDash: [4, 4],
            pointRadius: 0,
            borderWidth: 1.5,
            tension: 0.3,
            yAxisID: 'y1',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'month', displayFormats: { month: 'yyyy-MM' } },
            grid: { color: getChartGridColor() },
            ticks: { color: getChartTextColor() },
          },
          y: {
            position: 'left',
            title: { display: true, text: 'Difficulty (T)', color: '#3b82f6' },
            grid: { color: getChartGridColor() },
            ticks: { color: '#3b82f6', callback: v => v.toFixed(0) + 'T' },
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'BTC Price ($)', color: '#f59e0b' },
            grid: { drawOnChartArea: false },
            ticks: { color: '#f59e0b', callback: v => '$' + (v / 1000).toFixed(0) + 'k' },
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: c => {
                if (c.datasetIndex === 0) return 'Difficulty: ' + c.parsed.y.toFixed(2) + ' T';
                return 'BTC: $' + fmt(c.parsed.y);
              }
            }
          }
        }
      }
    });

    // Hashrate + Hashprice dual-axis chart
    if (charts.fcHash) charts.fcHash.destroy();
    const ctx2 = document.getElementById('chartForecastHash').getContext('2d');
    charts.fcHash = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: result.map(r => r.date),
        datasets: [
          {
            label: 'Hashrate (EH/s)',
            data: result.map(r => r.hashrateEH),
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6,182,212,0.08)',
            fill: true,
            pointRadius: 3,
            borderWidth: 2,
            tension: 0.3,
            yAxisID: 'y',
          },
          {
            label: 'Hashprice',
            data: result.map(r => r.hashprice),
            borderColor: '#10b981',
            borderDash: [4, 4],
            pointRadius: 0,
            borderWidth: 1.5,
            tension: 0.3,
            yAxisID: 'y1',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'month', displayFormats: { month: 'yyyy-MM' } },
            grid: { color: getChartGridColor() },
            ticks: { color: getChartTextColor() },
          },
          y: {
            position: 'left',
            title: { display: true, text: 'Hashrate (EH/s)', color: '#06b6d4' },
            grid: { color: getChartGridColor() },
            ticks: { color: '#06b6d4' },
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'Hashprice ($/TH/day)', color: '#10b981' },
            grid: { drawOnChartArea: false },
            ticks: { color: '#10b981', callback: v => '$' + v.toFixed(4) },
          }
        },
      }
    });
  }

  function renderForecastTable(result) {
    const tbody = document.getElementById('forecastTbody');
    tbody.innerHTML = result.map(r => `
      <tr>
        <td>${r.dateStr}</td>
        <td>$${fmt(r.btcPrice)}</td>
        <td>${r.difficultyT.toFixed(2)} T</td>
        <td>${r.hashrateEH.toFixed(1)}</td>
        <td>$${r.hashprice.toFixed(4)}</td>
        <td>${r.asicEfficiency} J/TH</td>
        <td>$${fmt(r.costPerBTC)}</td>
      </tr>
    `).join('');
  }

  // ── Scenarios ───────────────────────────────────────────
  function runScenarios() {
    try {
      const ns = data && data.networkStats;
      const price = data && data.btcPrice;
      const baseParams = {
        currentDifficulty: ns ? ns.difficulty : 144e12,
        currentHashrateEH: ns ? ns.hashrateEH : 950,
        currentBtcPrice: price ? price.price : 69000,
        currentDate: new Date(),
        currentBlockHeight: ns ? ns.blockHeight : 939000,
        electricityRate: 0.055,
        asicEfficiencyNow: 21.5,
        asicEfficiencyEnd: 15.0,
        minerMargin: 0.40,
        forecastMonths: 12,
      };
      scenarioResults = DifficultyModel.multiScenario(baseParams);
      renderScenarioSummary();
      renderScenarioCharts();
      renderScenarioTable();
    } catch (e) { console.error('[App] Scenario error:', e); }
  }

  function renderScenarioSummary() {
    const container = document.getElementById('scenarioSummary');
    const html = ['bull', 'base', 'bear'].map(key => {
      const s = scenarioResults[key];
      const d = s.data;
      const first = d[0];
      const last = d[d.length - 1];
      const diffChange = ((last.difficultyT - first.difficultyT) / first.difficultyT * 100).toFixed(1);
      const hashChange = ((last.hashrateEH - first.hashrateEH) / first.hashrateEH * 100).toFixed(1);
      return `
        <div class="scenario-card ${key}">
          <div class="scenario-card-title">${lang === 'zh' ? s.label : s.labelEn}</div>
          <div class="scenario-metric">
            <span class="scenario-metric-label">BTC ${lang === 'zh' ? '终值' : 'End'}</span>
            <span class="scenario-metric-value">$${fmt(last.btcPrice)}</span>
          </div>
          <div class="scenario-metric">
            <span class="scenario-metric-label">${lang === 'zh' ? '难度终值' : 'End Difficulty'}</span>
            <span class="scenario-metric-value">${last.difficultyT.toFixed(1)} T</span>
          </div>
          <div class="scenario-metric">
            <span class="scenario-metric-label">${lang === 'zh' ? '难度变化' : 'Diff Change'}</span>
            <span class="scenario-metric-value" style="color:${parseFloat(diffChange) >= 0 ? 'var(--green)' : 'var(--red)'}">${diffChange}%</span>
          </div>
          <div class="scenario-metric">
            <span class="scenario-metric-label">${lang === 'zh' ? '算力终值' : 'End Hashrate'}</span>
            <span class="scenario-metric-value">${last.hashrateEH.toFixed(0)} EH/s</span>
          </div>
          <div class="scenario-metric">
            <span class="scenario-metric-label">${lang === 'zh' ? '算力变化' : 'Hash Change'}</span>
            <span class="scenario-metric-value" style="color:${parseFloat(hashChange) >= 0 ? 'var(--green)' : 'var(--red)'}">${hashChange}%</span>
          </div>
          <div class="scenario-metric">
            <span class="scenario-metric-label">Hashprice</span>
            <span class="scenario-metric-value">$${last.hashprice.toFixed(4)}</span>
          </div>
        </div>
      `;
    }).join('');
    container.innerHTML = html;
  }

  function makeTimeScaleOpts() {
    return {
      type: 'time',
      time: { unit: 'month', displayFormats: { month: 'yyyy-MM' } },
      grid: { color: getChartGridColor() },
      ticks: { color: getChartTextColor() },
    };
  }

  function renderScenarioCharts() {
    const legendOpts = { display: true, position: 'top', labels: { color: getChartTextColor(), usePointStyle: true, pointStyle: 'circle' } };

    // Difficulty comparison
    if (charts.scenDiff) charts.scenDiff.destroy();
    charts.scenDiff = new Chart(document.getElementById('chartScenarios').getContext('2d'), {
      type: 'line',
      data: {
        datasets: ['bull', 'base', 'bear'].map(key => {
          const s = scenarioResults[key];
          return {
            label: lang === 'zh' ? s.label : s.labelEn,
            data: s.data.map(r => ({ x: r.date, y: r.difficultyT })),
            borderColor: s.color, backgroundColor: s.color + '14',
            fill: key === 'base', pointRadius: 2, borderWidth: 2, tension: 0.3,
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: legendOpts },
        scales: {
          x: makeTimeScaleOpts(),
          y: { title: { display: true, text: 'Difficulty (T)', color: getChartTextColor() }, grid: { color: getChartGridColor() }, ticks: { color: getChartTextColor(), callback: v => v.toFixed(0) + 'T' } }
        },
      }
    });

    // Hashrate comparison
    if (charts.scenHash) charts.scenHash.destroy();
    charts.scenHash = new Chart(document.getElementById('chartScenariosHash').getContext('2d'), {
      type: 'line',
      data: {
        datasets: ['bull', 'base', 'bear'].map(key => {
          const s = scenarioResults[key];
          return {
            label: lang === 'zh' ? s.label : s.labelEn,
            data: s.data.map(r => ({ x: r.date, y: r.hashrateEH })),
            borderColor: s.color, pointRadius: 2, borderWidth: 2, tension: 0.3,
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: legendOpts },
        scales: {
          x: makeTimeScaleOpts(),
          y: { title: { display: true, text: 'Hashrate (EH/s)', color: getChartTextColor() }, grid: { color: getChartGridColor() }, ticks: { color: getChartTextColor() } }
        },
      }
    });

    // Price path comparison
    if (charts.scenPrice) charts.scenPrice.destroy();
    charts.scenPrice = new Chart(document.getElementById('chartScenariosPrice').getContext('2d'), {
      type: 'line',
      data: {
        datasets: ['bull', 'base', 'bear'].map(key => {
          const s = scenarioResults[key];
          return {
            label: lang === 'zh' ? s.label : s.labelEn,
            data: s.data.map(r => ({ x: r.date, y: r.btcPrice })),
            borderColor: s.color, pointRadius: 2, borderWidth: 2, tension: 0.3,
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: legendOpts },
        scales: {
          x: makeTimeScaleOpts(),
          y: { title: { display: true, text: 'BTC Price ($)', color: getChartTextColor() }, grid: { color: getChartGridColor() }, ticks: { color: getChartTextColor(), callback: v => '$' + (v / 1000).toFixed(0) + 'k' } }
        },
      }
    });
  }

  function renderScenarioTable() {
    const tbody = document.getElementById('scenarioTbody');
    const metrics = [
      { label: { zh: 'BTC 终值价格', en: 'BTC End Price' }, key: 'btcPrice', fmt: v => '$' + fmt(v) },
      { label: { zh: '难度终值', en: 'End Difficulty' }, key: 'difficultyT', fmt: v => v.toFixed(1) + ' T' },
      { label: { zh: '算力终值', en: 'End Hashrate' }, key: 'hashrateEH', fmt: v => v.toFixed(0) + ' EH/s' },
      { label: { zh: 'Hashprice', en: 'Hashprice' }, key: 'hashprice', fmt: v => '$' + v.toFixed(4) },
      { label: { zh: 'ASIC 效率', en: 'ASIC Efficiency' }, key: 'asicEfficiency', fmt: v => v + ' J/TH' },
      { label: { zh: '矿工成本/BTC', en: 'Miner Cost/BTC' }, key: 'costPerBTC', fmt: v => '$' + fmt(v) },
    ];
    tbody.innerHTML = metrics.map(m => {
      const bull = scenarioResults.bull.data.at(-1);
      const base = scenarioResults.base.data.at(-1);
      const bear = scenarioResults.bear.data.at(-1);
      return `
        <tr>
          <td style="font-family:var(--font-sans);font-weight:500;">${m.label[lang]}</td>
          <td style="color:var(--green)">${m.fmt(bull[m.key])}</td>
          <td style="color:var(--accent-blue)">${m.fmt(base[m.key])}</td>
          <td style="color:var(--red)">${m.fmt(bear[m.key])}</td>
        </tr>
      `;
    }).join('');
  }

  // ── Auto-run ────────────────────────────────────────────
  runCustomForecast();
  runScenarios();

})();
