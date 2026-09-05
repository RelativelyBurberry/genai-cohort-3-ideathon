/**
 * Backend Firestore Connectivity Probe
 * 
 * This script tests whether the backend Admin SDK can access the named Firestore database:
 * ai-studio-reflectra-07ab4b1d-1624-4acf-8074-a976e2a233c2
 * 
 * Tests performed:
 * 1. Database ID resolution
 * 2. Read operation (attempts to read a document)
 * 3. Write operation (attempts to write a test document)
 * 4. Reports IAM/runtime permission status
 */

import { getAdminDb, getFirestoreDatabaseId, getFirebaseAdmin } from '../server/firebaseAdmin.js';

async function probeFirestoreConnectivity(): Promise<void> {
  console.log('=== FIRESTORE BACKEND CONNECTIVITY PROBE ===\n');

  // Step 1: Report database targeting
  const databaseId = getFirestoreDatabaseId();
  console.log('A. DATABASE TARGETING');
  console.log(`   Database ID: ${databaseId}`);
  console.log(`   Expected: ai-studio-reflectra-07ab4b1d-1624-4acf-8074-a976e2a233c2`);
  console.log(`   Match: ${databaseId === 'ai-studio-reflectra-07ab4b1d-1624-4acf-8074-a976e2a233c2' ? 'YES' : 'NO'}\n`);

  // Step 2: Report Firebase Admin initialization
  console.log('B. FIREBASE ADMIN INITIALIZATION');
  try {
    const app = getFirebaseAdmin();
    console.log(`   App initialized: ${app ? 'YES' : 'NO'}`);
    console.log(`   Project ID: ${app.options.projectId || 'NOT SET'}\n`);
  } catch (error: any) {
    console.log(`   App initialization FAILED: ${error.message}\n`);
    return;
  }

  // Step 3: Attempt Firestore operations
  console.log('C. FIRESTORE NAMED DATABASE ACCESS');
  const db = getAdminDb();
  console.log(`   Firestore instance: ${db ? 'OBTAINED' : 'NULL'}`);
  
  // Test document path (doesn't need to exist - we're testing permissions)
  const testPath = 'users/__connectivity_probe_test__/conversations/__test__';
  const testDocRef = db.doc(testPath);

  console.log('\n   Testing READ operation...');
  try {
    await testDocRef.get();
    console.log('   READ: SUCCESS (document may or may not exist, but access is granted)\n');
  } catch (error: any) {
    console.log('   READ: FAILED');
    console.log(`   Error name: ${error.name || 'Unknown'}`);
    console.log(`   Error code: ${error.code || error.status || 'Unknown'}`);
    const sanitizedMessage = (error.message || 'Unknown')
      .replace(/[A-Za-z0-9_-]{20,}/g, '[REDACTED]')
      .replace(/\d{10,}/g, '[TIMESTAMP]');
    console.log(`   Error message: ${sanitizedMessage}\n`);
    
    if (error.code === 7 || error.status === 'PERMISSION_DENIED') {
      console.log('   DIAGNOSIS: PERMISSION_DENIED');
      console.log('   This indicates the backend service identity lacks IAM permissions');
      console.log('   Required role: roles/datastore.user or roles/firestore.user');
      console.log('   Action: Check IAM permissions for the runtime service account\n');
    }
    return;
  }

  // If read succeeded, test write
  console.log('   Testing WRITE operation...');
  try {
    await testDocRef.set({
      probeTest: true,
      timestamp: new Date().toISOString(),
      note: 'This is a connectivity probe test document'
    });
    console.log('   WRITE: SUCCESS\n');

    // Clean up - delete the test document
    console.log('   Testing DELETE operation...');
    await testDocRef.delete();
    console.log('   DELETE: SUCCESS\n');
    
    console.log('   DIAGNOSIS: FULL ACCESS GRANTED');
    console.log('   Backend can read and write to the named Firestore database\n');
  } catch (error: any) {
    console.log('   WRITE: FAILED');
    console.log(`   Error name: ${error.name || 'Unknown'}`);
    console.log(`   Error code: ${error.code || error.status || 'Unknown'}`);
    const sanitizedMessage = (error.message || 'Unknown')
      .replace(/[A-Za-z0-9_-]{20,}/g, '[REDACTED]')
      .replace(/\d{10,}/g, '[TIMESTAMP]');
    console.log(`   Error message: ${sanitizedMessage}\n`);
    
    if (error.code === 7 || error.status === 'PERMISSION_DENIED') {
      console.log('   DIAGNOSIS: WRITE PERMISSION_DENIED');
      console.log('   Backend has read access but lacks write IAM permissions\n');
    }
  }
}

probeFirestoreConnectivity()
  .then(() => {
    console.log('=== PROBE COMPLETE ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('PROBE UNEXPECTED ERROR:', error);
    process.exit(1);
  });
