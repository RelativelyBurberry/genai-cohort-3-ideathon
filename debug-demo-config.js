// Simple test to verify demoConfig logic
let importMetaEnv = {};

// Mock the function exactly as implemented
function isDemoModeEnabled() {
  // Vite exposes env vars on import.meta.env
  // @ts-ignore - Vite provides these types at build time
  const flag = importMetaEnv.VITE_DEMO_MODE;
  return flag === 'true';
}

// Mock vitest functions
const vitestMock = {
  stubGlobal: (key, value) => {
    if (key === 'import.meta') {
      importMetaEnv = value.env || {};
    }
  },
  resetModules: () => {
    // Nothing to reset in this isolated test
  },
  unstubAllGlobals: () => {
    importMetaEnv = {};
  }
};

// Test function
function mockEnv(demoMode) {
  vitestMock.stubGlobal('import.meta', {
    env: {
      VITE_DEMO_MODE: demoMode,
    },
  });
}

console.log('=== Debug Demo Config ===');

// Test undefined
mockEnv(undefined);
vitestMock.resetModules();
console.log('undefined:', isDemoModeEnabled());
console.log('flag value:', importMetaEnv.VITE_DEMO_MODE);

// Test empty string
mockEnv('');
vitestMock.resetModules();
console.log('empty string:', isDemoModeEnabled());
console.log('flag value:', importMetaEnv.VITE_DEMO_MODE);

// Test "false"
mockEnv('false');
vitestMock.resetModules();
console.log('false string:', isDemoModeEnabled());
console.log('flag value:', importMetaEnv.VITE_DEMO_MODE);

// Test "true"
mockEnv('true');
vitestMock.resetModules();
console.log('true string:', isDemoModeEnabled());
console.log('flag value:', importMetaEnv.VITE_DEMO_MODE);

// Cleanup
vitestMock.unstubAllGlobals();