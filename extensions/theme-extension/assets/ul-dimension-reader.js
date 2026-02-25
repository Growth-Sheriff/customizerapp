/* ============================================================
   UL Dimension Reader - EXIF/DPI Extraction from Images
   Version: 1.0.0
   Reads physical dimensions from PNG/JPG EXIF data
   Namespace: window.ULDimensionReader
   ============================================================ */

(function () {
  'use strict';

  if (window.ULDimensionReader) return;

  /**
   * Default DPI assumption when EXIF data is missing
   */
  const DEFAULT_DPI = 150;

  /**
   * Minimum viable DPI for print
   */
  const MIN_PRINT_DPI = 72;

  /**
   * @typedef {Object} DimensionResult
   * @property {number} widthPx - Width in pixels
   * @property {number} heightPx - Height in pixels
   * @property {number} dpi - Detected or assumed DPI
   * @property {number} widthInch - Width in inches
   * @property {number} heightInch - Height in inches
   * @property {number} widthCm - Width in centimeters
   * @property {number} heightCm - Height in centimeters
   * @property {boolean} dpiFromExif - Whether DPI was read from EXIF/metadata
   * @property {string} source - 'exif' | 'png_phys' | 'assumed'
   * @property {string} format - 'png' | 'jpeg' | 'webp' | 'unknown'
   */

  /**
   * Main entry: read dimensions from a File object
   * @param {File} file - The uploaded file
   * @returns {Promise<DimensionResult>}
   */
  async function readDimensions(file) {
    if (!file || !file.type) {
      throw new Error('Invalid file provided');
    }

    const format = detectFormat(file);

    if (format === 'png') {
      return readPngDimensions(file);
    }

    if (format === 'jpeg') {
      return readJpegDimensions(file);
    }

    if (format === 'webp') {
      return readImageElementDimensions(file, 'webp');
    }

    // For unsupported formats (PDF, AI, PSD), try Image element fallback
    return readImageElementDimensions(file, format);
  }

  /**
   * Detect image format from file type and extension
   * @param {File} file
   * @returns {string}
   */
  function detectFormat(file) {
    const type = file.type.toLowerCase();
    if (type === 'image/png') return 'png';
    if (type === 'image/jpeg' || type === 'image/jpg') return 'jpeg';
    if (type === 'image/webp') return 'webp';
    if (type === 'image/tiff') return 'tiff';

    // Fallback to extension
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (ext === 'png') return 'png';
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
    if (ext === 'webp') return 'webp';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'ai' || ext === 'eps') return 'vector';
    if (ext === 'psd') return 'psd';
    if (ext === 'tiff' || ext === 'tif') return 'tiff';

    return 'unknown';
  }

  /**
   * Read PNG dimensions with pHYs chunk for DPI
   * PNG pHYs chunk contains pixels-per-unit information
   * @param {File} file
   * @returns {Promise<DimensionResult>}
   */
  async function readPngDimensions(file) {
    const buffer = await readFileAsArrayBuffer(file);
    const view = new DataView(buffer);

    // Verify PNG signature: 137 80 78 71 13 10 26 10
    if (view.getUint32(0) !== 0x89504E47 || view.getUint32(4) !== 0x0D0A1A0A) {
      // Not a valid PNG, fallback to Image element
      return readImageElementDimensions(file, 'png');
    }

    // Read IHDR chunk (always first chunk after signature)
    // Offset 8: length(4) + type(4) = at offset 16 is IHDR data
    const widthPx = view.getUint32(16);
    const heightPx = view.getUint32(20);

    // Search for pHYs chunk
    let dpi = DEFAULT_DPI;
    let dpiFromExif = false;
    let source = 'assumed';

    let offset = 8; // Start after PNG signature
    while (offset < buffer.byteLength - 12) {
      const chunkLength = view.getUint32(offset);
      const chunkType = getChunkType(view, offset + 4);

      if (chunkType === 'pHYs') {
        // pHYs chunk: pixelsPerUnitX(4) + pixelsPerUnitY(4) + unit(1)
        const dataOffset = offset + 8;
        const pxPerUnitX = view.getUint32(dataOffset);
        const pxPerUnitY = view.getUint32(dataOffset + 4);
        const unit = view.getUint8(dataOffset + 8);

        if (unit === 1) {
          // Unit is meter, convert to DPI (1 inch = 0.0254 meters)
          const dpiX = Math.round(pxPerUnitX * 0.0254);
          const dpiY = Math.round(pxPerUnitY * 0.0254);
          dpi = Math.max(dpiX, dpiY);
          if (dpi >= MIN_PRINT_DPI) {
            dpiFromExif = true;
            source = 'png_phys';
          } else {
            dpi = DEFAULT_DPI;
          }
        } else if (pxPerUnitX > 0) {
          // Unit is unknown, but if values look like DPI (72-1200 range)
          if (pxPerUnitX >= MIN_PRINT_DPI && pxPerUnitX <= 2400) {
            dpi = pxPerUnitX;
            dpiFromExif = true;
            source = 'png_phys';
          }
        }
        break;
      }

      if (chunkType === 'IDAT' || chunkType === 'IEND') {
        // No pHYs found before image data
        break;
      }

      // Move to next chunk: length(4) + type(4) + data(chunkLength) + CRC(4)
      offset += 4 + 4 + chunkLength + 4;
    }

    return buildResult(widthPx, heightPx, dpi, dpiFromExif, source, 'png');
  }

  /**
   * Read 4-byte chunk type as string
   * @param {DataView} view
   * @param {number} offset
   * @returns {string}
   */
  function getChunkType(view, offset) {
    return String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
  }

  /**
   * Read JPEG dimensions with EXIF/JFIF DPI
   * @param {File} file
   * @returns {Promise<DimensionResult>}
   */
  async function readJpegDimensions(file) {
    const buffer = await readFileAsArrayBuffer(file);
    const view = new DataView(buffer);

    // Verify JPEG SOI marker
    if (view.getUint16(0) !== 0xFFD8) {
      return readImageElementDimensions(file, 'jpeg');
    }

    let dpi = DEFAULT_DPI;
    let dpiFromExif = false;
    let source = 'assumed';
    let widthPx = 0;
    let heightPx = 0;

    let offset = 2;

    while (offset < buffer.byteLength - 4) {
      // Find next marker
      if (view.getUint8(offset) !== 0xFF) {
        offset++;
        continue;
      }

      const marker = view.getUint8(offset + 1);

      // SOS (Start of Scan) - stop searching
      if (marker === 0xDA) break;

      // SOFn markers (Start of Frame) for dimensions
      if (
        (marker >= 0xC0 && marker <= 0xC3) ||
        (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) ||
        (marker >= 0xCD && marker <= 0xCF)
      ) {
        // SOF: length(2) + precision(1) + height(2) + width(2)
        heightPx = view.getUint16(offset + 5);
        widthPx = view.getUint16(offset + 7);
      }

      // APP0 (JFIF) marker for DPI
      if (marker === 0xE0) {
        const segLength = view.getUint16(offset + 2);
        // Check JFIF identifier
        if (
          segLength >= 16 &&
          view.getUint8(offset + 4) === 0x4A && // J
          view.getUint8(offset + 5) === 0x46 && // F
          view.getUint8(offset + 6) === 0x49 && // I
          view.getUint8(offset + 7) === 0x46    // F
        ) {
          const densityUnits = view.getUint8(offset + 11);
          const xDensity = view.getUint16(offset + 12);
          const yDensity = view.getUint16(offset + 14);

          if (densityUnits === 1 && xDensity >= MIN_PRINT_DPI) {
            // DPI directly
            dpi = Math.max(xDensity, yDensity);
            dpiFromExif = true;
            source = 'exif';
          } else if (densityUnits === 2 && xDensity >= 1) {
            // Dots per cm, convert to DPI
            dpi = Math.round(Math.max(xDensity, yDensity) * 2.54);
            dpiFromExif = true;
            source = 'exif';
          }
        }
      }

      // APP1 (EXIF) marker for DPI
      if (marker === 0xE1) {
        const exifDpi = parseExifDpi(view, offset);
        if (exifDpi && exifDpi >= MIN_PRINT_DPI) {
          dpi = exifDpi;
          dpiFromExif = true;
          source = 'exif';
        }
      }

      // Move to next segment
      const segmentLength = view.getUint16(offset + 2);
      offset += 2 + segmentLength;
    }

    // If SOF didn't yield dimensions, use Image element
    if (widthPx === 0 || heightPx === 0) {
      const imgResult = await readImageElementDimensions(file, 'jpeg');
      widthPx = imgResult.widthPx;
      heightPx = imgResult.heightPx;
    }

    return buildResult(widthPx, heightPx, dpi, dpiFromExif, source, 'jpeg');
  }

  /**
   * Attempt to parse EXIF IFD0 for XResolution/YResolution
   * @param {DataView} view
   * @param {number} markerOffset
   * @returns {number|null}
   */
  function parseExifDpi(view, markerOffset) {
    try {
      const segLength = view.getUint16(markerOffset + 2);
      if (segLength < 14) return null;

      // Check "Exif\0\0"
      const exifOffset = markerOffset + 4;
      if (
        view.getUint8(exifOffset) !== 0x45 || // E
        view.getUint8(exifOffset + 1) !== 0x78 || // x
        view.getUint8(exifOffset + 2) !== 0x69 || // i
        view.getUint8(exifOffset + 3) !== 0x66    // f
      ) {
        return null;
      }

      const tiffOffset = exifOffset + 6;
      
      // Determine byte order
      const byteOrder = view.getUint16(tiffOffset);
      const isLittleEndian = byteOrder === 0x4949; // II = little endian

      // Verify TIFF magic 42
      const magic = view.getUint16(tiffOffset + 2, isLittleEndian);
      if (magic !== 42) return null;

      // Get offset to first IFD
      const ifdOffset = view.getUint32(tiffOffset + 4, isLittleEndian);
      const ifdStart = tiffOffset + ifdOffset;

      // Number of IFD entries
      const entryCount = view.getUint16(ifdStart, isLittleEndian);

      let xRes = null;
      let yRes = null;
      let resUnit = 2; // Default: inches

      for (let i = 0; i < entryCount && i < 50; i++) {
        const entryOffset = ifdStart + 2 + i * 12;
        if (entryOffset + 12 > view.byteLength) break;

        const tag = view.getUint16(entryOffset, isLittleEndian);
        const type = view.getUint16(entryOffset + 2, isLittleEndian);
        const valueOffset = view.getUint32(entryOffset + 8, isLittleEndian);

        // XResolution (tag 0x011A = 282)
        if (tag === 0x011A && type === 5) {
          const ratioOffset = tiffOffset + valueOffset;
          if (ratioOffset + 8 <= view.byteLength) {
            const num = view.getUint32(ratioOffset, isLittleEndian);
            const den = view.getUint32(ratioOffset + 4, isLittleEndian);
            if (den > 0) xRes = num / den;
          }
        }

        // YResolution (tag 0x011B = 283)
        if (tag === 0x011B && type === 5) {
          const ratioOffset = tiffOffset + valueOffset;
          if (ratioOffset + 8 <= view.byteLength) {
            const num = view.getUint32(ratioOffset, isLittleEndian);
            const den = view.getUint32(ratioOffset + 4, isLittleEndian);
            if (den > 0) yRes = num / den;
          }
        }

        // ResolutionUnit (tag 0x0128 = 296)
        if (tag === 0x0128) {
          resUnit = view.getUint16(entryOffset + 8, isLittleEndian);
        }
      }

      let resolvedDpi = null;
      const rawDpi = Math.max(xRes || 0, yRes || 0);

      if (rawDpi > 0) {
        if (resUnit === 2) {
          // Inches
          resolvedDpi = Math.round(rawDpi);
        } else if (resUnit === 3) {
          // Centimeters → inches
          resolvedDpi = Math.round(rawDpi * 2.54);
        } else {
          // Assume inches
          resolvedDpi = Math.round(rawDpi);
        }
      }

      return resolvedDpi;
    } catch (e) {
      console.warn('[ULDimensionReader] EXIF parse error:', e.message);
      return null;
    }
  }

  /**
   * Fallback: use Image element to get pixel dimensions
   * DPI is assumed since Image API doesn't provide it
   * @param {File} file
   * @param {string} format
   * @returns {Promise<DimensionResult>}
   */
  function readImageElementDimensions(file, format) {
    return new Promise(function (resolve, reject) {
      // Check if file is an image type that can be loaded
      if (!file.type.startsWith('image/')) {
        // For non-image files (PDF, AI), we can't read dimensions client-side
        resolve({
          widthPx: 0,
          heightPx: 0,
          dpi: DEFAULT_DPI,
          widthInch: 0,
          heightInch: 0,
          widthCm: 0,
          heightCm: 0,
          dpiFromExif: false,
          source: 'unknown',
          format: format,
          error: 'Cannot read dimensions from this file type client-side',
        });
        return;
      }

      var url = URL.createObjectURL(file);
      var img = new Image();

      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(
          buildResult(img.naturalWidth, img.naturalHeight, DEFAULT_DPI, false, 'assumed', format)
        );
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for dimension reading'));
      };

      img.src = url;
    });
  }

  /**
   * Read file as ArrayBuffer (only first 64KB needed for metadata)
   * @param {File} file
   * @returns {Promise<ArrayBuffer>}
   */
  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      // Only read first 64KB for metadata extraction
      var slice = file.slice(0, Math.min(file.size, 65536));

      reader.onload = function () {
        resolve(reader.result);
      };

      reader.onerror = function () {
        reject(new Error('Failed to read file'));
      };

      reader.readAsArrayBuffer(slice);
    });
  }

  /**
   * Build a standardized DimensionResult
   * @param {number} widthPx
   * @param {number} heightPx
   * @param {number} dpi
   * @param {boolean} dpiFromExif
   * @param {string} source
   * @param {string} format
   * @returns {DimensionResult}
   */
  function buildResult(widthPx, heightPx, dpi, dpiFromExif, source, format) {
    var safeDpi = dpi > 0 ? dpi : DEFAULT_DPI;
    var widthInch = widthPx / safeDpi;
    var heightInch = heightPx / safeDpi;

    return {
      widthPx: widthPx,
      heightPx: heightPx,
      dpi: safeDpi,
      widthInch: parseFloat(widthInch.toFixed(2)),
      heightInch: parseFloat(heightInch.toFixed(2)),
      widthCm: parseFloat((widthInch * 2.54).toFixed(2)),
      heightCm: parseFloat((heightInch * 2.54).toFixed(2)),
      dpiFromExif: dpiFromExif,
      source: source,
      format: format,
    };
  }

  /**
   * Get a thumbnail data URL from a file (for preview)
   * @param {File} file
   * @param {number} maxSize - Max dimension for thumbnail
   * @returns {Promise<string>} data URL
   */
  function getThumbnail(file, maxSize) {
    maxSize = maxSize || 120;
    return new Promise(function (resolve, reject) {
      if (!file.type.startsWith('image/')) {
        resolve('');
        return;
      }

      var url = URL.createObjectURL(file);
      var img = new Image();

      img.onload = function () {
        URL.revokeObjectURL(url);
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve('');
      };

      img.src = url;
    });
  }

  /**
   * Format dimensions for display
   * @param {DimensionResult} dims
   * @param {string} unit - 'inch' | 'cm'
   * @returns {string}
   */
  function formatDimensions(dims, unit) {
    if (!dims || dims.widthPx === 0) return 'Unknown';

    if (unit === 'cm') {
      return dims.widthCm + ' × ' + dims.heightCm + ' cm';
    }

    return dims.widthInch + '" × ' + dims.heightInch + '"';
  }

  /**
   * Format pixel dimensions
   * @param {DimensionResult} dims
   * @returns {string}
   */
  function formatPixels(dims) {
    if (!dims || dims.widthPx === 0) return 'Unknown';
    return dims.widthPx + ' × ' + dims.heightPx + ' px';
  }

  // ── Public API ──
  window.ULDimensionReader = {
    readDimensions: readDimensions,
    getThumbnail: getThumbnail,
    formatDimensions: formatDimensions,
    formatPixels: formatPixels,
    DEFAULT_DPI: DEFAULT_DPI,
    MIN_PRINT_DPI: MIN_PRINT_DPI,
  };
})();
