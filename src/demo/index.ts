/**
 * Demo Mode Module
 * 
 * Provides a development-only demo workspace for local UI preview.
 * 
 * SECURITY GUARANTEES:
 * - Demo mode is gated by VITE_DEMO_MODE environment variable
 * - Disabled by default (must be explicitly enabled)
 * - Does NOT create Firebase tokens
 * - Does NOT call backend APIs
 * - Does NOT write to production Firestore
 * - Does NOT invoke Gemini
 * - Uses only local synthetic data
 * 
 * USAGE:
 * 
 * 1. Enable demo mode locally:
 *    Create .env.local with: VITE_DEMO_MODE=true
 * 
 * 2. Start dev server:
 *    npm run dev
 * 
 * 3. Click "Explore Demo →" on the landing page
 * 
 * 4. Reset demo workspace:
 *    Click "Reset demo workspace" in Settings
 */

export { 
  isDemoModeEnabled, 
  DEMO_USER, 
  DEMO_STORAGE_KEY,
  resetDemoWorkspace 
} from './demoConfig';

export { 
  DEMO_JOURNAL_ENTRIES, 
  DEMO_CONVERSATIONS, 
  DEMO_MESSAGES, 
  DEMO_PATTERN_INSIGHT 
} from './demoData';

export { 
  DemoProvider, 
  useDemo, 
  useIsDemoSession 
} from './DemoContext';
