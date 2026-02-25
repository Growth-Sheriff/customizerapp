/* ============================================================
   UL Nesting Engine - Grid Strip-Packing Algorithm
   Version: 1.0.0
   Calculates optimal placement of designs on DTF sheets
   Namespace: window.ULNestingEngine
   ============================================================ */

(function () {
  'use strict';

  if (window.ULNestingEngine) return;

  /**
   * @typedef {Object} NestingConfig
   * @property {number} gapMm - Gap between designs in mm (default: 3)
   * @property {number} marginMm - Sheet margin in mm (default: 5)
   * @property {boolean} allowRotation - Allow 90° rotation (default: true)
   * @property {'waste' | 'sheets' | 'balanced'} strategy - Optimization strategy
   */

  /**
   * @typedef {Object} DesignSpec
   * @property {number} widthInch - Design width in inches
   * @property {number} heightInch - Design height in inches
   * @property {number} quantity - Number of copies needed
   */

  /**
   * @typedef {Object} SheetSpec
   * @property {string} id - Variant identifier
   * @property {string} name - Display name (e.g., "22\" × 30\"")
   * @property {number} widthInch - Sheet width in inches
   * @property {number} heightInch - Sheet height in inches
   * @property {number} price - Price per sheet
   * @property {number} variantId - Shopify variant ID
   */

  /**
   * @typedef {Object} PlacedDesign
   * @property {number} x - X position in inches (from left)
   * @property {number} y - Y position in inches (from top)
   * @property {number} width - Placed width in inches
   * @property {number} height - Placed height in inches
   * @property {boolean} rotated - Whether the design was rotated 90°
   * @property {number} index - Design copy index (0-based)
   */

  /**
   * @typedef {Object} SheetLayout
   * @property {number} sheetIndex - Sheet number (0-based)
   * @property {PlacedDesign[]} placements - Designs placed on this sheet
   * @property {number} usedArea - Total used area in sq inches
   * @property {number} totalArea - Total sheet area in sq inches
   * @property {number} efficiency - Usage percentage (0-100)
   */

  /**
   * @typedef {Object} NestingResult
   * @property {SheetSpec} sheet - The sheet variant used
   * @property {number} sheetsNeeded - Total sheets required
   * @property {number} designsPerSheet - Designs fitting on one sheet
   * @property {number} totalDesigns - Total designs placed
   * @property {number} wastePercent - Average waste percentage
   * @property {number} efficiency - Average efficiency percentage
   * @property {SheetLayout[]} layouts - Per-sheet layout data
   * @property {number} totalCost - Total cost (sheets × price)
   * @property {number} costPerDesign - Cost per individual design
   */

  /**
   * Default nesting configuration
   */
  var DEFAULT_CONFIG = {
    gapMm: 3,
    marginMm: 5,
    allowRotation: true,
    strategy: 'balanced',
  };

  /**
   * Convert mm to inches
   * @param {number} mm
   * @returns {number}
   */
  function mmToInch(mm) {
    return mm / 25.4;
  }

  /**
   * Calculate how many designs fit on a single sheet using grid strip packing
   * This is the core algorithm that determines placement coordinates
   * 
   * @param {DesignSpec} design - Design dimensions
   * @param {SheetSpec} sheet - Sheet dimensions
   * @param {NestingConfig} config - Nesting configuration
   * @returns {{count: number, placements: PlacedDesign[], rotated: boolean}}
   */
  function calculateGridFit(design, sheet, config) {
    var gap = mmToInch(config.gapMm);
    var margin = mmToInch(config.marginMm);

    // Usable area after margins
    var usableWidth = sheet.widthInch - 2 * margin;
    var usableHeight = sheet.heightInch - 2 * margin;

    if (usableWidth <= 0 || usableHeight <= 0) {
      return { count: 0, placements: [], rotated: false };
    }

    // Try both orientations
    var normalResult = fitGrid(
      design.widthInch,
      design.heightInch,
      usableWidth,
      usableHeight,
      gap,
      margin,
      false
    );

    var rotatedResult = { count: 0, placements: [], rotated: true };

    if (config.allowRotation && design.widthInch !== design.heightInch) {
      rotatedResult = fitGrid(
        design.heightInch,
        design.widthInch,
        usableWidth,
        usableHeight,
        gap,
        margin,
        true
      );
    }

    // Also try mixed: some rows normal, some rotated
    var mixedResult = { count: 0, placements: [], rotated: false };
    if (config.allowRotation && design.widthInch !== design.heightInch) {
      mixedResult = fitGridMixed(
        design.widthInch,
        design.heightInch,
        usableWidth,
        usableHeight,
        gap,
        margin
      );
    }

    // Return the best result
    if (mixedResult.count >= normalResult.count && mixedResult.count >= rotatedResult.count) {
      return mixedResult;
    }
    if (rotatedResult.count >= normalResult.count) {
      return rotatedResult;
    }
    return normalResult;
  }

  /**
   * Fit designs in a grid pattern (single orientation)
   * @param {number} dw - Design width
   * @param {number} dh - Design height
   * @param {number} uw - Usable width
   * @param {number} uh - Usable height
   * @param {number} gap - Gap between designs
   * @param {number} margin - Sheet margin
   * @param {boolean} rotated - Whether designs are rotated
   * @returns {{count: number, placements: PlacedDesign[], rotated: boolean}}
   */
  function fitGrid(dw, dh, uw, uh, gap, margin, rotated) {
    if (dw <= 0 || dh <= 0 || dw > uw || dh > uh) {
      return { count: 0, placements: [], rotated: rotated };
    }

    // How many fit in each direction
    var cols = Math.floor((uw + gap) / (dw + gap));
    var rows = Math.floor((uh + gap) / (dh + gap));

    if (cols <= 0 || rows <= 0) {
      return { count: 0, placements: [], rotated: rotated };
    }

    var placements = [];
    var index = 0;

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        placements.push({
          x: margin + col * (dw + gap),
          y: margin + row * (dh + gap),
          width: dw,
          height: dh,
          rotated: rotated,
          index: index++,
        });
      }
    }

    return {
      count: cols * rows,
      placements: placements,
      rotated: rotated,
    };
  }

  /**
   * Try mixed orientation: alternate rows of normal and rotated designs
   * This can sometimes pack more designs than a uniform grid
   * @param {number} dw - Original design width
   * @param {number} dh - Original design height
   * @param {number} uw - Usable width
   * @param {number} uh - Usable height
   * @param {number} gap - Gap between designs
   * @param {number} margin - Sheet margin
   * @returns {{count: number, placements: PlacedDesign[], rotated: boolean}}
   */
  function fitGridMixed(dw, dh, uw, uh, gap, margin) {
    var placements = [];
    var index = 0;
    var y = 0;

    // Determine which orientation gives more per row
    var normalCols = dw > 0 ? Math.floor((uw + gap) / (dw + gap)) : 0;
    var rotatedCols = dh > 0 ? Math.floor((uw + gap) / (dh + gap)) : 0;

    while (y < uh) {
      // Try normal row
      var normalFits = false;
      if (y + dh <= uh && normalCols > 0) {
        normalFits = true;
      }

      // Try rotated row
      var rotatedFits = false;
      if (y + dw <= uh && rotatedCols > 0) {
        rotatedFits = true;
      }

      if (!normalFits && !rotatedFits) break;

      // Pick the row type that fits more designs
      var useRotated = false;
      var rowHeight = dh;
      var rowCols = normalCols;

      if (normalFits && rotatedFits) {
        // Choose based on which packs more per row considering height consumed
        var normalDensity = normalCols / dh;
        var rotatedDensity = rotatedCols / dw;
        if (rotatedDensity > normalDensity) {
          useRotated = true;
          rowHeight = dw;
          rowCols = rotatedCols;
        }
      } else if (rotatedFits) {
        useRotated = true;
        rowHeight = dw;
        rowCols = rotatedCols;
      }

      var placedWidth = useRotated ? dh : dw;
      var placedHeight = useRotated ? dw : dh;

      for (var col = 0; col < rowCols; col++) {
        placements.push({
          x: margin + col * (placedWidth + gap),
          y: margin + y,
          width: placedWidth,
          height: placedHeight,
          rotated: useRotated,
          index: index++,
        });
      }

      y += rowHeight + gap;
    }

    return {
      count: placements.length,
      placements: placements,
      rotated: false, // mixed
    };
  }

  /**
   * Calculate full nesting result for a design × sheet × quantity combination
   * @param {DesignSpec} design
   * @param {SheetSpec} sheet
   * @param {NestingConfig} config
   * @returns {NestingResult}
   */
  function nestDesigns(design, sheet, config) {
    config = Object.assign({}, DEFAULT_CONFIG, config || {});

    var gridResult = calculateGridFit(design, sheet, config);
    var designsPerSheet = gridResult.count;

    if (designsPerSheet === 0) {
      return {
        sheet: sheet,
        sheetsNeeded: 0,
        designsPerSheet: 0,
        totalDesigns: 0,
        wastePercent: 100,
        efficiency: 0,
        layouts: [],
        totalCost: 0,
        costPerDesign: Infinity,
        error: 'Design too large for this sheet',
      };
    }

    var quantity = design.quantity;
    var sheetsNeeded = Math.ceil(quantity / designsPerSheet);

    // Generate layouts for each sheet
    var layouts = [];
    var totalUsedArea = 0;
    var designArea = design.widthInch * design.heightInch;
    var sheetArea = sheet.widthInch * sheet.heightInch;

    for (var s = 0; s < sheetsNeeded; s++) {
      var designsOnThisSheet = Math.min(designsPerSheet, quantity - s * designsPerSheet);
      
      // Take only the placements needed for this sheet
      var sheetPlacements = [];
      for (var d = 0; d < designsOnThisSheet; d++) {
        var placement = Object.assign({}, gridResult.placements[d]);
        placement.index = s * designsPerSheet + d;
        sheetPlacements.push(placement);
      }

      var usedArea = designsOnThisSheet * designArea;
      totalUsedArea += usedArea;

      layouts.push({
        sheetIndex: s,
        placements: sheetPlacements,
        usedArea: parseFloat(usedArea.toFixed(2)),
        totalArea: parseFloat(sheetArea.toFixed(2)),
        efficiency: parseFloat(((usedArea / sheetArea) * 100).toFixed(1)),
      });
    }

    var avgEfficiency = totalUsedArea / (sheetsNeeded * sheetArea) * 100;
    var totalCost = sheetsNeeded * (sheet.price || 0);
    var costPerDesign = quantity > 0 ? totalCost / quantity : 0;

    return {
      sheet: sheet,
      sheetsNeeded: sheetsNeeded,
      designsPerSheet: designsPerSheet,
      totalDesigns: quantity,
      wastePercent: parseFloat((100 - avgEfficiency).toFixed(1)),
      efficiency: parseFloat(avgEfficiency.toFixed(1)),
      layouts: layouts,
      totalCost: parseFloat(totalCost.toFixed(2)),
      costPerDesign: parseFloat(costPerDesign.toFixed(2)),
    };
  }

  /**
   * Calculate nesting for ALL available sheet variants
   * Returns sorted results with the best option first
   * @param {DesignSpec} design
   * @param {SheetSpec[]} sheets - All available sheet variants
   * @param {NestingConfig} config
   * @returns {NestingResult[]}
   */
  function nestAllVariants(design, sheets, config) {
    if (!design || !sheets || sheets.length === 0) {
      return [];
    }

    config = Object.assign({}, DEFAULT_CONFIG, config || {});

    var results = [];

    for (var i = 0; i < sheets.length; i++) {
      var result = nestDesigns(design, sheets[i], config);
      if (result.designsPerSheet > 0) {
        results.push(result);
      }
    }

    // Sort based on strategy
    results.sort(function (a, b) {
      if (config.strategy === 'waste') {
        // Minimize waste
        return a.wastePercent - b.wastePercent;
      }
      if (config.strategy === 'sheets') {
        // Minimize sheet count, then waste
        if (a.sheetsNeeded !== b.sheetsNeeded) {
          return a.sheetsNeeded - b.sheetsNeeded;
        }
        return a.wastePercent - b.wastePercent;
      }
      // 'balanced' - weighted score
      var scoreA = a.sheetsNeeded * 2 + a.wastePercent * 0.5 + (a.totalCost || 0) * 0.1;
      var scoreB = b.sheetsNeeded * 2 + b.wastePercent * 0.5 + (b.totalCost || 0) * 0.1;
      return scoreA - scoreB;
    });

    // Mark best option
    if (results.length > 0) {
      results[0].recommended = true;
    }

    return results;
  }

  /**
   * Parse sheet dimensions from a variant name string
   * Handles formats like: "22x30", "22\" x 30\"", "22 x 30 inch", "22×30"
   * @param {string} variantName
   * @returns {{widthInch: number, heightInch: number} | null}
   */
  function parseSheetSize(variantName) {
    if (!variantName) return null;

    // Remove quotes, inch symbols, "inch" text
    var cleaned = variantName
      .replace(/["""'']/g, '')
      .replace(/\binch(es)?\b/gi, '')
      .replace(/\bin\b/gi, '')
      .trim();

    // Try matching patterns: "NUMBERxNUMBER" or "NUMBER × NUMBER"
    var match = cleaned.match(/(\d+(?:\.\d+)?)\s*[x×X]\s*(\d+(?:\.\d+)?)/);
    if (match) {
      return {
        widthInch: parseFloat(match[1]),
        heightInch: parseFloat(match[2]),
      };
    }

    // Try matching "NUMBER by NUMBER"
    match = cleaned.match(/(\d+(?:\.\d+)?)\s*by\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      return {
        widthInch: parseFloat(match[1]),
        heightInch: parseFloat(match[2]),
      };
    }

    return null;
  }

  /**
   * Build SheetSpec array from Shopify product variants
   * @param {Array} variants - Shopify variant objects
   * @returns {SheetSpec[]}
   */
  function variantsToSheets(variants) {
    if (!variants || !Array.isArray(variants)) return [];

    var sheets = [];

    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var name = v.title || v.option1 || '';
      var dims = parseSheetSize(name);

      if (!dims) continue;

      // Skip if dimensions are unreasonably small
      if (dims.widthInch < 1 || dims.heightInch < 1) continue;

      sheets.push({
        id: v.id ? String(v.id) : 'variant_' + i,
        name: dims.widthInch + '" × ' + dims.heightInch + '"',
        widthInch: dims.widthInch,
        heightInch: dims.heightInch,
        price: parseFloat(v.price || 0) / 100, // Shopify price is in cents
        variantId: v.id,
      });
    }

    return sheets;
  }

  /**
   * Format area for display
   * @param {number} sqInches
   * @returns {string}
   */
  function formatArea(sqInches) {
    return parseFloat(sqInches.toFixed(1)) + ' in²';
  }

  /**
   * Get efficiency tier for visual styling
   * @param {number} efficiency - Percentage (0-100)
   * @returns {'high' | 'medium' | 'low'}
   */
  function getEfficiencyTier(efficiency) {
    if (efficiency >= 70) return 'high';
    if (efficiency >= 40) return 'medium';
    return 'low';
  }

  // ── Public API ──
  window.ULNestingEngine = {
    nestDesigns: nestDesigns,
    nestAllVariants: nestAllVariants,
    calculateGridFit: calculateGridFit,
    parseSheetSize: parseSheetSize,
    variantsToSheets: variantsToSheets,
    formatArea: formatArea,
    getEfficiencyTier: getEfficiencyTier,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
  };
})();
