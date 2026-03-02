/**
 * Data fetching layer — historical difficulty & BTC price from public APIs
 */

const DataLoader = (() => {

  async function safeFetch(url, timeout = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // Blockchain.info API for historical difficulty
  async function fetchHistoricalDifficulty() {
    try {
      const data = await safeFetch('https://api.blockchain.info/charts/difficulty?timespan=2years&format=json&cors=true');
      return data.values.map(v => ({
        date: new Date(v.x * 1000),
        dateStr: new Date(v.x * 1000).toISOString().split('T')[0],
        difficulty: v.y,
        difficultyT: v.y / 1e12,
      }));
    } catch (e) {
      console.warn('[DataLoader] difficulty fetch failed:', e.message);
      return null;
    }
  }

  // Fetch current BTC price
  async function fetchBtcPrice() {
    try {
      const data = await safeFetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
      return {
        price: data.bitcoin.usd,
        change24h: data.bitcoin.usd_24h_change,
      };
    } catch (e) {
      console.warn('[DataLoader] BTC price fetch failed:', e.message);
      return null;
    }
  }

  // Fetch current network stats from blockchair
  async function fetchNetworkStats() {
    try {
      const data = await safeFetch('https://api.blockchair.com/bitcoin/stats');
      const d = data.data;
      return {
        difficulty: d.difficulty,
        difficultyT: d.difficulty / 1e12,
        hashrate24h: d.hashrate_24h,
        hashrateEH: parseFloat(d.hashrate_24h) / 1e18,
        blocks: d.blocks,
        blockHeight: d.blocks,
        bestBlockTime: d.best_block_time,
        nextRetargetEstimate: d.next_retarget_time_estimate,
        nextDifficultyEstimate: d.next_difficulty_estimate,
        mempoolTxs: d.mempool_transactions,
      };
    } catch (e) {
      console.warn('[DataLoader] network stats fetch failed:', e.message);
      return null;
    }
  }

  // Fetch hashrate history — blockchain.info returns TH/s
  async function fetchHistoricalHashrate() {
    try {
      const data = await safeFetch('https://api.blockchain.info/charts/hash-rate?timespan=2years&format=json&cors=true');
      const unit = (data.unit || '').toLowerCase();
      // API unit is "TH/s" — convert to EH/s: 1 EH = 1e6 TH
      // If unit ever changes, handle dynamically
      let divisor = 1e6; // TH/s → EH/s
      if (unit.includes('gh')) divisor = 1e9;
      if (unit.includes('ph')) divisor = 1e3;
      return data.values.map(v => ({
        date: new Date(v.x * 1000),
        dateStr: new Date(v.x * 1000).toISOString().split('T')[0],
        hashrate: v.y,
        hashrateEH: v.y / divisor,
      }));
    } catch (e) {
      console.warn('[DataLoader] hashrate history fetch failed:', e.message);
      return null;
    }
  }

  // Load all data in parallel — each is independent, one failure doesn't affect others
  async function loadAll() {
    const results = await Promise.allSettled([
      fetchHistoricalDifficulty(),
      fetchBtcPrice(),
      fetchNetworkStats(),
      fetchHistoricalHashrate(),
    ]);
    return {
      difficulty: results[0].status === 'fulfilled' ? results[0].value : null,
      btcPrice:   results[1].status === 'fulfilled' ? results[1].value : null,
      networkStats: results[2].status === 'fulfilled' ? results[2].value : null,
      hashrate:   results[3].status === 'fulfilled' ? results[3].value : null,
    };
  }

  return { loadAll };
})();
