/**
 * Remote Console Logger
 * =====================
 * Captures console logs and sends them to server for debugging
 * 
 * Only captures logs with specific prefixes:
 * - [UL]
 * - [ULTShirtModal]
 * - [ULState]
 * - [ULEvents]
 * - [Preflight]
 * - [THREE]
 * 
 * Version: 1.0.0
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    enabled: true,
    endpoint: 'https://customizerapp.dev/api/debug/log',
    batchSize: 10,
    flushInterval: 3000, // 3 seconds
    maxQueueSize: 100,
    prefixes: ['[UL', '[Preflight', '[THREE', '[Texture', '[Decal', '[GLB', '[WebGL']
  };

  // Log queue
  let logQueue = [];
  let flushTimeout = null;

  // Original console methods
  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console)
  };

  // Check if message should be captured
  function shouldCapture(args) {
    if (!args || args.length === 0) return false;
    
    const firstArg = String(args[0]);
    return CONFIG.prefixes.some(prefix => firstArg.includes(prefix));
  }

  // Format arguments to string
  function formatArgs(args) {
    return Array.from(args).map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 0);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  }

  // Add log to queue
  function queueLog(level, args) {
    if (!CONFIG.enabled) return;
    if (!shouldCapture(args)) return;

    const entry = {
      level,
      message: formatArgs(args),
      time: new Date().toISOString()
    };

    logQueue.push(entry);

    // Trim queue if too large
    if (logQueue.length > CONFIG.maxQueueSize) {
      logQueue = logQueue.slice(-CONFIG.maxQueueSize);
    }

    // Schedule flush
    if (!flushTimeout) {
      flushTimeout = setTimeout(flushLogs, CONFIG.flushInterval);
    }

    // Flush immediately if batch size reached
    if (logQueue.length >= CONFIG.batchSize) {
      flushLogs();
    }
  }

  // Flush logs to server
  async function flushLogs() {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    if (logQueue.length === 0) return;

    const logsToSend = logQueue.slice();
    logQueue = [];

    try {
      const response = await fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: logsToSend,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        // Put logs back if failed
        logQueue = logsToSend.concat(logQueue).slice(-CONFIG.maxQueueSize);
      }
    } catch (error) {
      // Silent fail - don't break the app
      // Put logs back
      logQueue = logsToSend.concat(logQueue).slice(-CONFIG.maxQueueSize);
    }
  }

  // Override console methods
  console.log = function(...args) {
    originalConsole.log.apply(console, args);
    queueLog('log', args);
  };

  console.warn = function(...args) {
    originalConsole.warn.apply(console, args);
    queueLog('warn', args);
  };

  console.error = function(...args) {
    originalConsole.error.apply(console, args);
    queueLog('error', args);
  };

  console.info = function(...args) {
    originalConsole.info.apply(console, args);
    queueLog('info', args);
  };

  // Flush on page unload
  window.addEventListener('beforeunload', () => {
    if (logQueue.length > 0) {
      // Use sendBeacon for reliable delivery
      try {
        navigator.sendBeacon(CONFIG.endpoint, JSON.stringify({
          logs: logQueue,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }));
      } catch {
        // Ignore errors
      }
    }
  });

  // Expose for debugging
  window.ULRemoteLogger = {
    flush: flushLogs,
    getQueue: () => logQueue.slice(),
    setEnabled: (enabled) => { CONFIG.enabled = enabled; },
    isEnabled: () => CONFIG.enabled
  };

  originalConsole.log('[ULRemoteLogger] Initialized - capturing logs with prefixes:', CONFIG.prefixes.join(', '));
})();
