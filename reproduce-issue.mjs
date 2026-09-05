// Reproduce exactly what vitest does - using ES modules
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const vitest = {
  stubGlobal: (key, value) => {
    global[key] = value;
  },
  resetModules: () => {
    // Clear require cache for our module - not directly available in ESM
    // We'll have to rely on vitest's mocking mechanism
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
try {
  console.log('global.import.meta:', global.import.meta);
  console.log('global.import.meta.env:', global.import.meta.env);
  console.log('global.import.meta.env.VITE_DEMO_MODE:', global.import.meta.env.VITE_DEMO_MODE);
} catch (e) {
  console.log('Error accessing import.meta:', e.message);
}

console.log('Calling resetModules...');
vitest.resetModules();

console.log('After resetModules:');
try {
  console.log('global.import.meta:', global.import.meta);
  console.log('global.import.meta.env:', global.import.meta.env);
  console.log('global.import.meta.env.VITE_DEMO_MODE:', global.import.meta.env.VITE_DEMO_MODE);
} catch (e) {
  console.log('Error accessing import.meta:', e.message);
}

// Import after reset - using dynamic import
import('./src/demo/demoConfig.js').then(demoConfig => {
  console.log('Imported demoConfig');
  console.log('isDemoModeEnabled():', demoConfig.isDemoModeEnabled());
  
  // Cleanup
  vitest.unstubAllGlobals();
}).catch(err => {
  console.log('Import error:', err);
  vitest.unstubAllGlobals();
});