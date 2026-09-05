import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;
let cachedDatabaseId: string | null = null;

export function getFirestoreDatabaseId(): string {
  if (cachedDatabaseId) {
    return cachedDatabaseId;
  }

  let databaseId = process.env.FIRESTORE_DATABASE_ID;

  // Fallback to local configuration file if available
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!databaseId && config.firestoreDatabaseId) {
        databaseId = config.firestoreDatabaseId;
      }
    } catch (e) {
      console.error('[FirebaseAdmin] Failed to parse firebase-applet-config.json:', e);
    }
  }

  cachedDatabaseId = databaseId || '(default)';
  return cachedDatabaseId;
}

export function getFirebaseAdmin(): App {
  if (adminApp) {
    return adminApp;
  }

  let projectId = process.env.FIREBASE_PROJECT_ID;

  // Fallback to local configuration file if available
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!projectId && config.projectId) {
        projectId = config.projectId;
      }
    } catch (e) {
      console.error('[FirebaseAdmin] Failed to parse firebase-applet-config.json:', e);
    }
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    adminApp = existingApps[0];
  } else {
    adminApp = initializeApp({
      projectId: projectId || undefined,
    });
  }

  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getFirebaseAdmin());
}

export function getAdminDb(): Firestore {
  const app = getFirebaseAdmin();
  const dbId = getFirestoreDatabaseId();
  if (dbId && dbId !== '(default)') {
    return getFirestore(app, dbId);
  }
  return getFirestore(app);
}
