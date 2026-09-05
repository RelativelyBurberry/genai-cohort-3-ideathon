// Test the actual function directly by mocking import.meta
let importMetaEnv = {};

// Save original
const originalImportMeta = global.import.meta;

// Mock function
function isDemoModeEnabled() {
  // Vite exposes env vars on import.meta.env
  // @ts-ignore - Vite provides these types at build time
  const flag = importMetaEnv.VITE_DEMO_MODE;
  return flag === 'true' || flag === true; // Original logic
}

// Test function
function mockEnv(demoMode) {
  importMetaEnv = {
    VITE_DEMO_MODE: demoMode,
  };
  // Update global import.meta
  global.import.meta = {
    env: importMetaEnv,
  };
}

// Reset function
function reset() {
  importMetaEnv = {};
  global.import.meta = originalImportMeta;
}

console.log('=== Direct Function Test ===');

// Test undefined
mockEnv(undefined);
console.log('undefined:', isDemoModeEnabled());

// Test empty string
mockEnv('');
console.log('empty string:', isDemoModeEnabled());

// Test "false"
mockEnv('false');
console.log('false string:', isDemoModeEnabled());

// Test "true"
mockEnv('true');
console.log('true string:', isDemoModeEnabled());

// Test boolean true
mockEnv(true);
console.log('boolean true:', isDemoModeEnabled());

// Test boolean false
mockEnv(false);
console.log('boolean false:', isDemoModeEnabled());

// Cleanup
reset();