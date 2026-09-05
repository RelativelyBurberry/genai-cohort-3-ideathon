// Reproduce exactly what vitest does
const vitest = {
  stubGlobal: (key, value) => {
    global[key] = value;
  },
  resetModules: () => {
    // Clear require cache for our module
    Object.keys(require.cache).forEach(key => {
      if (key.includes('demoConfig')) {
        delete require.cache[key];
      }
    });
  },
  unstubAllGlobals: () => {
    delete global.import.meta;
  }
};

// Mock import.meta.env
const mockEnv = (demoMode) => {
  vitest.stubGlobal('import.meta', {
    env: {
      VITE_DEMO_MODE: demoMode,
    },
  });
};

console.log('=== Reproducing Vitest Behavior ===');

// Test the failing case
mockEnv('true');
console.log('After mockEnv true:');
console.log('global.import.meta:', global.import.meta);
console.log('global.import.meta.env:', global.import.meta.env);
console.log('global.import.meta.env.VITE_DEMO_MODE:', global.import.meta.env.VITE_DEMO_MODE);

vitest.resetModules();
console.log('After resetModules:');
console.log('global.import.meta:', global.import.meta);
console.log('global.import.meta.env:', global.import.meta.env);
console.log('global.import.meta.env.VITE_DEMO_MODE:', global.import.meta.env.VITE_DEMO_MODE);

// Import after reset
const demoConfig = require('./src/demo/demoConfig');
console.log('Imported demoConfig');
console.log('isDemoModeEnabled():', demoConfig.isDemoModeEnabled());

// Cleanup
vitest.unstubAllGlobals();