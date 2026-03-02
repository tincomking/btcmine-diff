/**
 * Data fetching layer — historical difficulty & BTC price from public APIs
 */

const DataLoader = (() => {

  // Blockchain.info API for historical difficulty
  async function fetchHistoricalDifficulty() {
    try {
      // blockchain.info chart API — returns {values: [{x: timestamp, y: difficulty}]}
      const url = 'https://api.blockchain.info/charts/difficulty?timespan=2years&format=json&cors=true';
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return data.values.map(v => ({
        date: new Date(v.x * 1000),
        dateStr: new Date(v.x * 1000).toISOString().split('T')[0],
        difficulty: v.y,
        difficultyT: v.y / 1e12,
      }));
    } catch (e) {
      console.warn('Failed to fetch difficulty from blockchain.info:', e);
      return fetchDifficultyFallback();
    }
  }

  // Fallback: use CoinGecko-compatible hashrate data
  async function fetchDifficultyFallback() {
    try {
      const url = 'https://api.blockchair.com/bitcoin/stats';
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const d = data.data;
      // Returns current snapshot only
      return [{
        date: new Date(),
        dateStr: new Date().toISOString().split('T')[0],
        difficulty: d.difficulty,
        difficultyT: d.difficulty / 1e12,
        hashrate: d.hashrate_24h,
        blocks: d.blocks,
        nextRetarget: d.next_retarget_time_estimate,
      }];
    } catch (e) {
      console.warn('Fallback also failed:', e);
      return null;
    }
  }

  // Fetch current BTC price
  async function fetchBtcPrice() {
    try {
      const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return {
        price: data.bitcoin.usd,
        change24h: data.bitcoin.usd_24h_change,
      };
    } catch (e) {
      console.warn('Failed to fetch BTC price:', e);
      return null;
    }
  }

  // Fetch current network stats from blockchair
  async function fetchNetworkStats() {
    try {
      const resp = await fetch('https://api.blockchair.com/bitcoin/stats');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const d = data.data;
      return {
        difficulty: d.difficulty,
        difficultyT: d.difficulty / 1e12,
        hashrate24h: d.hashrate_24h,            // H/s string
        hashrateEH: parseFloat(d.hashrate_24h) / 1e18,
        blocks: d.blocks,
        blockHeight: d.blocks,
        bestBlockTime: d.best_block_time,
        nextRetargetEstimate: d.next_retarget_time_estimate,
        nextDifficultyEstimate: d.next_difficulty_estimate,
        countdownBlocks: d.countdowns?.next_retarget_blocks_left,
        mempoolTxs: d.mempool_transactions,
        mempoolSize: d.mempool_size,
        avgBlockTime: d.average_transaction_fee_24h,
        suggestedFee: d.suggested_transaction_fee_per_byte_sat,
      };
    } catch (e) {
      console.warn('Failed to fetch network stats:', e);
      return null;
    }
  }

  // Fetch hashrate history
  async function fetchHistoricalHashrate() {
    try {
      const url = 'https://api.blockchain.info/charts/hash-rate?timespan=2years&format=json&cors=true';
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return data.values.map(v => ({
        date: new Date(v.x * 1000),
        dateStr: new Date(v.x * 1000).toISOString().split('T')[0],
        hashrate: v.y,           // GH/s from blockchain.info
        hashrateEH: v.y / 1e9,  // convert GH/s to EH/s
      }));
    } catch (e) {
      console.warn('Failed to fetch hashrate history:', e);
      return null;
    }
  }

  // Load all data in parallel
  async function loadAll() {
    const [difficulty, btcPrice, networkStats, hashrate] = await Promise.all([
      fetchHistoricalDifficulty(),
      fetchBtcPrice(),
      fetchNetworkStats(),
      fetchHistoricalHashrate(),
    ]);
    return { difficulty, btcPrice, networkStats, hashrate };
  }

  return {
    fetchHistoricalDifficulty,
    fetchBtcPrice,
    fetchNetworkStats,
    fetchHistoricalHashrate,
    loadAll,
  };
})();
