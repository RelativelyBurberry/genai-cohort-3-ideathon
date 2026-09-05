// Simple test to verify the function logic
const vitestMock = {
  stubGlobal: (key, value) => {
    global[key] = value;
  },
  resetModules: () => {
    // Clear require cache for demoConfig
    Object.keys(require.cache).forEach(key => {
      if (key.endsWith('demoConfig.js') || key.endsWith('demoConfig.ts')) {
        delete require.cache[key];
      }
    });
  },
  unstubAllGlobals: () => {
    // Restore original
    delete global.import.meta;
  }
};

// Mock function
function mockEnv(demoMode) {
  vitestMock.stubGlobal('import.meta', {
    env: {
      VITE_DEMO_MODE: demoMode,
    },
  });
}

// Test function that mimics the actual implementation
function isDemoModeEnabled() {
  // @ts-ignore - Vite provides these types at build time
  const flag = import.meta.env.VITE_DEMO_MODE;
  return flag === 'true';
}

console.log('=== Simple Test ===');

// Test 1: undefined
mockEnv(undefined);
vitestMock.resetModules();
console.log('undefined:', isDemoModeEnabled());

// Test 2: empty string
mockEnv('');
vitestMock.resetModules();
console.log('empty string:', isDemoModeEnabled());

// Test 3: "false"
mockEnv('false');
vitestMock.resetModules();
console.log('false string:', isDemoModeEnabled());

// Test 4: "true"
mockEnv('true');
vitestMock.resetModules();
console.log('true string:', isDemoModeEnabled());

// Cleanup
vitestMock.unstubAllGlobals();