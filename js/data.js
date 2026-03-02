/**
 * Data fetching layer
 * Sources: mempool.space (hashrate + difficulty), CoinGecko (price), Blockchair (network stats)
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

  // mempool.space — returns both hashrate and difficulty history with CORS
  async function fetchMempoolMining() {
    try {
      const data = await safeFetch('https://mempool.space/api/v1/mining/hashrate/2y');
      const difficulty = (data.difficulty || []).map(d => ({
        date: new Date(d.time * 1000),
        dateStr: new Date(d.time * 1000).toISOString().split('T')[0],
        difficulty: d.difficulty,
        difficultyT: d.difficulty / 1e12,
        height: d.height,
        adjustment: d.adjustment,
      }));
      // hashrates: avgHashrate is in H/s
      const hashrate = (data.hashrates || []).map(h => ({
        date: new Date(h.timestamp * 1000),
        dateStr: new Date(h.timestamp * 1000).toISOString().split('T')[0],
        hashrate: h.avgHashrate,
        hashrateEH: h.avgHashrate / 1e18,
      }));
      return {
        difficulty,
        hashrate,
        currentHashrate: data.currentHashrate,
        currentDifficulty: data.currentDifficulty,
      };
    } catch (e) {
      console.warn('[DataLoader] mempool.space fetch failed:', e.message);
      return null;
    }
  }

  // CoinGecko — BTC price
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

  // Blockchair — network stats
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

  // Load all data in parallel
  async function loadAll() {
    const results = await Promise.allSettled([
      fetchMempoolMining(),
      fetchBtcPrice(),
      fetchNetworkStats(),
    ]);
    const mining = results[0].status === 'fulfilled' ? results[0].value : null;
    return {
      difficulty: mining ? mining.difficulty : null,
      hashrate: mining ? mining.hashrate : null,
      btcPrice: results[1].status === 'fulfilled' ? results[1].value : null,
      networkStats: results[2].status === 'fulfilled' ? results[2].value : null,
    };
  }

  return { loadAll };
})();
