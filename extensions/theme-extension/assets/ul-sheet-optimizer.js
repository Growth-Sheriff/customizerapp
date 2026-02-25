/* ============================================================
   UL Sheet Optimizer - Cost/Waste/Sheet Optimization
   Version: 1.0.0
   Ranks alternatives, selects optimal variant
   Namespace: window.ULSheetOptimizer
   ============================================================ */

(function () {
  'use strict';

  if (window.ULSheetOptimizer) return;

  /**
   * @typedef {Object} OptimizationResult
   * @property {Object} recommended - The best NestingResult
   * @property {Object[]} alternatives - Other viable options, sorted by score
   * @property {Object} comparison - Side-by-side comparison data
   * @property {Object} savings - How much the recommended option saves
   */

  /**
   * @typedef {Object} SavingsInfo
   * @property {number} sheetsReduced - Sheets saved vs worst option
   * @property {number} wasteSaved - Waste percentage improvement
   * @property {number} costSaved - Money saved vs worst option
   * @property {string} reason - Human-readable reason for recommendation
   */

  /**
   * Optimization weights for ranking
   */
  var WEIGHTS = {
    waste: {
      sheets: 0.2,
      waste: 0.6,
      cost: 0.2,
    },
    sheets: {
      sheets: 0.6,
      waste: 0.2,
      cost: 0.2,
    },
    balanced: {
      sheets: 0.35,
      waste: 0.35,
      cost: 0.3,
    },
    cost: {
      sheets: 0.2,
      waste: 0.2,
      cost: 0.6,
    },
  };

  /**
   * Calculate optimization score for a nesting result
   * Lower score = better option
   * @param {Object} result - NestingResult from ULNestingEngine
   * @param {string} strategy - 'waste' | 'sheets' | 'balanced' | 'cost'
   * @param {Object} normalization - Min/max values for normalization
   * @returns {number}
   */
  function calculateScore(result, strategy, normalization) {
    var w = WEIGHTS[strategy] || WEIGHTS.balanced;

    // Normalize values to 0-1 range
    var sheetScore = normalizeValue(
      result.sheetsNeeded,
      normalization.minSheets,
      normalization.maxSheets
    );
    var wasteScore = normalizeValue(
      result.wastePercent,
      normalization.minWaste,
      normalization.maxWaste
    );
    var costScore = normalizeValue(
      result.totalCost,
      normalization.minCost,
      normalization.maxCost
    );

    return sheetScore * w.sheets + wasteScore * w.waste + costScore * w.cost;
  }

  /**
   * Normalize a value to 0-1 range
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function normalizeValue(value, min, max) {
    if (max === min) return 0;
    return (value - min) / (max - min);
  }

  /**
   * Run full optimization on all nesting results
   * @param {Object[]} nestingResults - Array of NestingResult from ULNestingEngine.nestAllVariants
   * @param {string} strategy - Optimization strategy
   * @returns {OptimizationResult}
   */
  function optimize(nestingResults, strategy) {
    strategy = strategy || 'balanced';

    if (!nestingResults || nestingResults.length === 0) {
      return {
        recommended: null,
        alternatives: [],
        comparison: { headers: [], rows: [] },
        savings: null,
      };
    }

    // Filter out results with errors
    var viable = nestingResults.filter(function (r) {
      return r.designsPerSheet > 0 && !r.error;
    });

    if (viable.length === 0) {
      return {
        recommended: null,
        alternatives: [],
        comparison: { headers: [], rows: [] },
        savings: null,
        error: 'No sheet size can fit this design',
      };
    }

    // Calculate normalization bounds
    var normalization = {
      minSheets: Infinity,
      maxSheets: 0,
      minWaste: Infinity,
      maxWaste: 0,
      minCost: Infinity,
      maxCost: 0,
    };

    for (var i = 0; i < viable.length; i++) {
      var r = viable[i];
      normalization.minSheets = Math.min(normalization.minSheets, r.sheetsNeeded);
      normalization.maxSheets = Math.max(normalization.maxSheets, r.sheetsNeeded);
      normalization.minWaste = Math.min(normalization.minWaste, r.wastePercent);
      normalization.maxWaste = Math.max(normalization.maxWaste, r.wastePercent);
      normalization.minCost = Math.min(normalization.minCost, r.totalCost);
      normalization.maxCost = Math.max(normalization.maxCost, r.totalCost);
    }

    // Score and sort
    var scored = viable.map(function (r) {
      return {
        result: r,
        score: calculateScore(r, strategy, normalization),
      };
    });

    scored.sort(function (a, b) {
      return a.score - b.score;
    });

    var recommended = scored[0].result;
    recommended.recommended = true;
    recommended.score = scored[0].score;

    var alternatives = scored.slice(1).map(function (s) {
      s.result.recommended = false;
      s.result.score = s.score;
      return s.result;
    });

    // Calculate savings vs worst option
    var worst = scored[scored.length - 1].result;
    var savings = {
      sheetsReduced: worst.sheetsNeeded - recommended.sheetsNeeded,
      wasteSaved: parseFloat((worst.wastePercent - recommended.wastePercent).toFixed(1)),
      costSaved: parseFloat((worst.totalCost - recommended.totalCost).toFixed(2)),
      reason: generateRecommendationReason(recommended, worst, strategy),
    };

    // Build comparison table data
    var comparison = buildComparison(scored);

    return {
      recommended: recommended,
      alternatives: alternatives,
      comparison: comparison,
      savings: savings,
    };
  }

  /**
   * Generate a human-readable recommendation reason
   * @param {Object} best
   * @param {Object} worst
   * @param {string} strategy
   * @returns {string}
   */
  function generateRecommendationReason(best, worst, strategy) {
    var parts = [];

    if (best.sheetsNeeded < worst.sheetsNeeded) {
      var diff = worst.sheetsNeeded - best.sheetsNeeded;
      parts.push(
        diff + ' fewer sheet' + (diff > 1 ? 's' : '') + ' needed'
      );
    }

    if (best.efficiency > worst.efficiency) {
      parts.push(
        best.efficiency.toFixed(0) + '% material efficiency'
      );
    }

    if (best.totalCost < worst.totalCost && worst.totalCost > 0) {
      parts.push(
        'saves $' + (worst.totalCost - best.totalCost).toFixed(2)
      );
    }

    if (parts.length === 0) {
      parts.push('Best overall option for your design');
    }

    return parts.join(' · ');
  }

  /**
   * Build comparison table data
   * @param {Array} scored - Scored results
   * @returns {{headers: string[], rows: Object[]}}
   */
  function buildComparison(scored) {
    var headers = ['Sheet Size', 'Designs/Sheet', 'Sheets Needed', 'Efficiency', 'Waste', 'Cost'];
    var rows = [];

    for (var i = 0; i < scored.length; i++) {
      var r = scored[i].result;
      rows.push({
        sheetName: r.sheet.name,
        designsPerSheet: r.designsPerSheet,
        sheetsNeeded: r.sheetsNeeded,
        efficiency: r.efficiency.toFixed(1) + '%',
        waste: r.wastePercent.toFixed(1) + '%',
        cost: r.totalCost > 0 ? formatCost(r.totalCost) : '-',
        isBest: i === 0,
        score: scored[i].score,
        variantId: r.sheet.variantId,
      });
    }

    return { headers: headers, rows: rows };
  }

  /**
   * Quick check: does this design need optimization?
   * Returns true if the currently selected variant is suboptimal
   * @param {Object} currentResult - NestingResult for current variant
   * @param {Object} bestResult - NestingResult for best variant
   * @returns {boolean}
   */
  function isSuboptimal(currentResult, bestResult) {
    if (!currentResult || !bestResult) return false;
    if (currentResult.sheet.id === bestResult.sheet.id) return false;

    // Suboptimal if using more sheets or significantly more waste
    return (
      currentResult.sheetsNeeded > bestResult.sheetsNeeded ||
      currentResult.wastePercent > bestResult.wastePercent + 15
    );
  }

  /**
   * Format cost for display using Shopify currency when available
   * @param {number} amount - Amount in the shop's currency
   * @returns {string}
   */
  function formatCost(amount) {
    if (!amount || amount <= 0) return '-';
    // Shopify.formatMoney expects cents
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      try {
        return window.Shopify.formatMoney(
          amount * 100,
          window.Shopify.money_format || '${{amount}}'
        );
      } catch (e) { /* fallback below */ }
    }
    return '$' + amount.toFixed(2);
  }

  /**
   * Format percentage for display
   * @param {number} pct
   * @returns {string}
   */
  function formatPercent(pct) {
    return pct.toFixed(1) + '%';
  }

  /**
   * Get a summary text for a nesting result
   * @param {Object} result - NestingResult
   * @returns {string}
   */
  function getSummaryText(result) {
    if (!result || result.error) {
      return 'Design too large for this sheet';
    }

    return (
      result.designsPerSheet +
      ' design' + (result.designsPerSheet > 1 ? 's' : '') +
      '/sheet × ' +
      result.sheetsNeeded +
      ' sheet' + (result.sheetsNeeded > 1 ? 's' : '') +
      ' = ' +
      result.totalDesigns +
      ' total'
    );
  }

  /**
   * Suggest quantity adjustment for better efficiency
   * (e.g., if 20 designs need 5 sheets but 24 would also need 5 sheets)
   * @param {Object} result - NestingResult
   * @param {number} currentQuantity
   * @returns {{suggestedQuantity: number, reason: string} | null}
   */
  function suggestQuantityAdjust(result, currentQuantity) {
    if (!result || result.designsPerSheet <= 0) return null;

    var fullCapacity = result.sheetsNeeded * result.designsPerSheet;
    var unused = fullCapacity - currentQuantity;

    // Only suggest if there are significant unused slots (at least 2)
    if (unused >= 2 && unused <= result.designsPerSheet) {
      var pctFree = ((unused / fullCapacity) * 100).toFixed(0);
      return {
        suggestedQuantity: fullCapacity,
        reason:
          'You have room for ' +
          unused +
          ' more design' + (unused > 1 ? 's' : '') +
          ' (' + pctFree + '% of last sheet is unused). ' +
          'Order ' + fullCapacity + ' for maximum efficiency!',
      };
    }

    return null;
  }

  // ── Public API ──
  window.ULSheetOptimizer = {
    optimize: optimize,
    isSuboptimal: isSuboptimal,
    formatCost: formatCost,
    formatPercent: formatPercent,
    getSummaryText: getSummaryText,
    suggestQuantityAdjust: suggestQuantityAdjust,
    WEIGHTS: WEIGHTS,
  };
})();
