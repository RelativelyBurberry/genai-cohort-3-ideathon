import { describe, it, expect, vi } from 'vitest';

// Mock import.meta.env
const mockEnv = (demoMode) => {
  vi.stubGlobal('import.meta', {
    env: {
      VITE_DEMO_MODE: demoMode,
    },
  });
};

describe('simple test', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should work', async () => {
    mockEnv('true');
    vi.resetModules();
    
    // Import the function
    const { isDemoModeEnabled } = await import('./src/demo/demoConfig');
    
    // Check the value
    // @ts-ignore
    const flag = import.meta.env.VITE_DEMO_MODE;
    console.log('Flag in test:', flag);
    
    const result = isDemoModeEnabled();
    console.log('Result:', result);
    
    expect(result).toBe(true);
  });
});