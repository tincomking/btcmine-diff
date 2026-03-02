/**
 * Bitcoin Difficulty Prediction Model
 * Supply-Demand Equilibrium Framework
 *
 * Core logic:
 *   BTC price × block_reward × blocks_per_day = daily_revenue
 *   daily_revenue / electricity_cost_per_TH = equilibrium_hashrate
 *   hashrate → difficulty (deterministic mapping)
 */

const DifficultyModel = (() => {

  // ── Constants ──────────────────────────────────────────
  const BLOCKS_PER_DAY = 144;
  const BLOCKS_PER_EPOCH = 2016;
  const EPOCH_DAYS = BLOCKS_PER_EPOCH / BLOCKS_PER_DAY; // ~14 days
  const EPOCHS_PER_YEAR = 365.25 / EPOCH_DAYS;          // ~26.07
  const SATS_PER_BTC = 1e8;

  // Halving schedule (block heights)
  const HALVINGS = [
    { block: 0,       reward: 50 },
    { block: 210000,  reward: 25 },
    { block: 420000,  reward: 12.5 },
    { block: 630000,  reward: 6.25 },
    { block: 840000,  reward: 3.125 },  // April 2024
    { block: 1050000, reward: 1.5625 }, // ~2028
  ];

  // Current approximate block height (Mar 2026)
  const CURRENT_BLOCK_HEIGHT = 885000;

  /**
   * Get block reward at a given block height
   */
  function getBlockReward(blockHeight) {
    let reward = 50;
    for (const h of HALVINGS) {
      if (blockHeight >= h.block) reward = h.reward;
    }
    return reward;
  }

  /**
   * Estimate block height at a future date
   */
  function blockHeightAtDate(date, currentHeight, currentDate) {
    const daysDiff = (date - currentDate) / (1000 * 60 * 60 * 24);
    return Math.floor(currentHeight + daysDiff * BLOCKS_PER_DAY);
  }

  /**
   * Convert hashrate (TH/s) to difficulty
   * difficulty ≈ hashrate(H/s) × 600 / 2^32
   */
  function hashrateToDifficulty(hashrateTH) {
    const hashrateH = hashrateTH * 1e12;
    return hashrateH * 600 / Math.pow(2, 32);
  }

  /**
   * Convert difficulty to hashrate (TH/s)
   */
  function difficultyToHashrate(difficulty) {
    const hashrateH = difficulty * Math.pow(2, 32) / 600;
    return hashrateH / 1e12;
  }

  /**
   * Supply-Demand Equilibrium Model
   *
   * Demand side: How much revenue miners earn
   *   daily_revenue_USD = block_reward × BLOCKS_PER_DAY × btc_price + daily_fees
   *
   * Supply side: Cost to operate 1 TH/s for a day
   *   cost_per_TH_day = asic_efficiency(J/TH) × 3600 × 24 / 1e6 × electricity_rate($/kWh)
   *
   * Equilibrium: miners enter/exit until marginal revenue = marginal cost
   *   At equilibrium margin (e.g. 40% margin for capex/overhead):
   *   equilibrium_hashrate = daily_revenue / (cost_per_TH_day / (1 - margin))
   *
   * But we use a growth-constrained version:
   *   hashrate can't jump instantly — constrained by ASIC manufacturing/deployment
   */
  function runForecast(params) {
    const {
      currentDifficulty,
      currentHashrateEH,   // EH/s
      currentBtcPrice,
      currentDate,
      currentBlockHeight,
      // Scenario parameters
      btcPriceEnd,         // BTC price at end of forecast
      btcPricePath,        // 'linear', 'front-loaded', 'back-loaded'
      electricityRate,     // $/kWh global average
      asicEfficiencyNow,   // J/TH current fleet average
      asicEfficiencyEnd,   // J/TH end of forecast (improving)
      dailyFeesUSD,        // average daily fee revenue
      minerMargin,         // operating margin target (0.3-0.5)
      maxEpochGrowth,      // max hashrate growth per epoch (e.g. 0.05 = 5%)
      maxEpochDecline,     // max hashrate decline per epoch (e.g. -0.08)
      forecastMonths,      // how many months to forecast
    } = params;

    const results = [];
    const totalEpochs = Math.ceil(forecastMonths * 30.44 / EPOCH_DAYS);
    const startDate = new Date(currentDate);

    let hashrate = currentHashrateEH * 1e6; // convert to TH/s
    let difficulty = currentDifficulty;
    let blockHeight = currentBlockHeight || CURRENT_BLOCK_HEIGHT;

    for (let i = 0; i <= totalEpochs; i++) {
      const epochDate = new Date(startDate.getTime() + i * EPOCH_DAYS * 86400000);
      const progress = i / totalEpochs; // 0 to 1

      // Interpolate BTC price along chosen path
      const btcPrice = interpolatePrice(currentBtcPrice, btcPriceEnd, progress, btcPricePath);

      // Interpolate ASIC efficiency (improving over time)
      const asicEfficiency = asicEfficiencyNow + (asicEfficiencyEnd - asicEfficiencyNow) * progress;

      // Block reward at this height
      blockHeight = blockHeightAtDate(epochDate, currentBlockHeight || CURRENT_BLOCK_HEIGHT, startDate);
      const blockReward = getBlockReward(blockHeight);

      // Daily revenue (USD)
      const dailyRevenue = blockReward * BLOCKS_PER_DAY * btcPrice + (dailyFeesUSD || 0);

      // Cost per TH/s per day
      // J/TH × seconds_per_day / 1e6 = MWh per TH per day → × electricity rate
      const costPerTHDay = asicEfficiency * 86400 / 1e9 * electricityRate; // kWh × rate

      // Equilibrium hashrate (TH/s) — where marginal miner breaks even
      const equilibriumHashrate = dailyRevenue / (costPerTHDay / (1 - minerMargin));

      // Constrained hashrate — can't grow/shrink faster than deployment allows
      let targetHashrate = equilibriumHashrate;
      if (i > 0) {
        const maxUp = hashrate * (1 + maxEpochGrowth);
        const maxDown = hashrate * (1 + maxEpochDecline);
        targetHashrate = Math.max(maxDown, Math.min(maxUp, equilibriumHashrate));
      }

      hashrate = targetHashrate;
      difficulty = hashrateToDifficulty(hashrate);

      const hashrateEH = hashrate / 1e6;
      // Hashprice: daily revenue per TH/s (USD)
      const hashprice = dailyRevenue / hashrate;
      // Miner cost per BTC
      const costPerBTC = costPerTHDay * hashrate / (blockReward * BLOCKS_PER_DAY) / (1 - minerMargin);

      results.push({
        epoch: i,
        date: epochDate,
        dateStr: epochDate.toISOString().split('T')[0],
        btcPrice: Math.round(btcPrice),
        blockReward,
        difficulty: difficulty,
        difficultyT: difficulty / 1e12,
        hashrateEH: Math.round(hashrateEH * 100) / 100,
        hashprice: Math.round(hashprice * 10000) / 10000,
        asicEfficiency: Math.round(asicEfficiency * 10) / 10,
        costPerBTC: Math.round(costPerBTC),
        dailyRevenue: Math.round(dailyRevenue),
        equilibriumEH: Math.round(equilibriumHashrate / 1e6 * 100) / 100,
        minerMargin,
      });
    }

    return results;
  }

  /**
   * Price interpolation with different path shapes
   */
  function interpolatePrice(start, end, t, path) {
    switch (path) {
      case 'front-loaded':
        // Fast initial rise, then plateau
        t = 1 - Math.pow(1 - t, 2);
        break;
      case 'back-loaded':
        // Slow start, then accelerate
        t = t * t;
        break;
      case 'cycle':
        // Rise then fall (parabolic)
        t = 4 * t * (1 - t); // peaks at t=0.5
        break;
      case 'linear':
      default:
        break;
    }
    return start + (end - start) * t;
  }

  /**
   * Generate multi-scenario forecast
   */
  function multiScenario(baseParams) {
    const scenarios = {
      bull: {
        ...baseParams,
        btcPriceEnd: baseParams.currentBtcPrice * 2.0,
        btcPricePath: 'front-loaded',
        maxEpochGrowth: 0.06,
        maxEpochDecline: -0.03,
        dailyFeesUSD: 3000000,
        label: '牛市',
        labelEn: 'Bull',
        color: '#10b981',
      },
      base: {
        ...baseParams,
        btcPriceEnd: baseParams.currentBtcPrice * 1.3,
        btcPricePath: 'linear',
        maxEpochGrowth: 0.04,
        maxEpochDecline: -0.05,
        dailyFeesUSD: 1500000,
        label: '基准',
        labelEn: 'Base',
        color: '#3b82f6',
      },
      bear: {
        ...baseParams,
        btcPriceEnd: baseParams.currentBtcPrice * 0.6,
        btcPricePath: 'front-loaded',
        maxEpochGrowth: 0.02,
        maxEpochDecline: -0.08,
        dailyFeesUSD: 500000,
        label: '熊市',
        labelEn: 'Bear',
        color: '#ef4444',
      },
    };

    const results = {};
    for (const [key, params] of Object.entries(scenarios)) {
      results[key] = {
        data: runForecast(params),
        label: params.label,
        labelEn: params.labelEn,
        color: params.color,
      };
    }
    return results;
  }

  /**
   * Default parameters based on current network state
   */
  function getDefaults() {
    return {
      currentDifficulty: 114.17e12,
      currentHashrateEH: 850,
      currentBtcPrice: 86000,
      currentDate: new Date(),
      currentBlockHeight: CURRENT_BLOCK_HEIGHT,
      electricityRate: 0.055,
      asicEfficiencyNow: 21.5,
      asicEfficiencyEnd: 15.0,
      minerMargin: 0.40,
      maxEpochGrowth: 0.04,
      maxEpochDecline: -0.05,
      forecastMonths: 12,
      btcPriceEnd: 120000,
      btcPricePath: 'linear',
      dailyFeesUSD: 1500000,
    };
  }

  return {
    runForecast,
    multiScenario,
    getDefaults,
    hashrateToDifficulty,
    difficultyToHashrate,
    getBlockReward,
    EPOCH_DAYS,
    EPOCHS_PER_YEAR,
  };
})();
