// Mock what vitest does
const originalImportMeta = global.import.meta;

// Simulate vitest's mockEnv function
function mockEnv(demoMode) {
  global.import.meta = {
    env: {
      VITE_DEMO_MODE: demoMode,
    },
  };
}

// Reset function (like vitest's resetModules)
function resetModules() {
  // Clear require cache for our module
  Object.keys(require.cache).forEach(key => {
    if (key.includes('demoConfig')) {
      delete require.cache[key];
    }
  });
}

// Test the sequence
console.log('=== Test Sequence ===');

mockEnv('true');
console.log('After mockEnv true:');
console.log('import.meta.env.VITE_DEMO_MODE:', global.import.meta.env.VITE_DEMO_MODE);

resetModules();
console.log('After resetModules:');
console.log('import.meta.env.VITE_DEMO_MODE:', global.import.meta.env.VITE_DEMO_MODE);

// Import after reset
const demoConfig = require('./src/demo/demoConfig');
console.log('isDemoModeEnabled():', demoConfig.isDemoModeEnabled());

// Cleanup
global.import.meta = originalImportMeta;