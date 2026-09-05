// Simulate what the test does
let envStore = {};

function mockEnv(demoMode) {
  envStore = {
    VITE_DEMO_MODE: demoMode,
  };
}

function isDemoModeEnabled() {
  const flag = envStore.VITE_DEMO_MODE;
  return flag === 'true';
}

// Test the logic
mockEnv(undefined);
console.log('undefined:', isDemoModeEnabled());

mockEnv('');
console.log('empty string:', isDemoModeEnabled());

mockEnv('false');
console.log('false string:', isDemoModeEnabled());

mockEnv('true');
console.log('true string:', isDemoModeEnabled());