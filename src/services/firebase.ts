import { initializeApp, getApps, getApp, FirebaseApp, FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  Auth,
  User as FirebaseUser,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, Functions } from 'firebase/functions';
import { getMessaging, isSupported as isMessagingSupported, Messaging } from 'firebase/messaging';
import appletFirebaseConfig from '../firebase-applet-config.json';
import rootFirebaseConfig from '../../firebase-applet-config.json';

interface AppletFirebaseConfig extends FirebaseOptions {
  firestoreDatabaseId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

/**
 * Automatically resolves the linked Firebase project configuration directly
 * from the project's built-in configuration files without requiring manual
 * environment variables or user-entered API keys.
 */
function resolveProjectFirebaseConfig(): AppletFirebaseConfig {
  const primary = (appletFirebaseConfig || {}) as AppletFirebaseConfig;
  const fallback = (rootFirebaseConfig || {}) as AppletFirebaseConfig;

  return {
    projectId: primary.projectId || fallback.projectId,
    appId: primary.appId || fallback.appId,
    apiKey: primary.apiKey || fallback.apiKey,
    authDomain: primary.authDomain || fallback.authDomain,
    firestoreDatabaseId: primary.firestoreDatabaseId || fallback.firestoreDatabaseId,
    storageBucket: primary.storageBucket || fallback.storageBucket,
    messagingSenderId: primary.messagingSenderId || fallback.messagingSenderId,
    measurementId: primary.measurementId || fallback.measurementId || undefined,
    oAuthClientId: primary.oAuthClientId || fallback.oAuthClientId,
    recaptchaSiteKey: primary.recaptchaSiteKey || fallback.recaptchaSiteKey,
  };
}

export const firebaseProjectConfig = resolveProjectFirebaseConfig();

// 1. Firebase App (linked to existing project: gen-lang-client-0204359963)
export const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseProjectConfig) : getApp();

// 2. Cloud Firestore (linked to existing database: ai-studio-trustwalletpro-...)
export const db: Firestore =
  firebaseProjectConfig.firestoreDatabaseId &&
  firebaseProjectConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseProjectConfig.firestoreDatabaseId)
    : getFirestore(app);

// 3. Firebase Authentication
export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// 4. Firebase Storage (linked to existing bucket)
export const storage: FirebaseStorage = getStorage(
  app,
  firebaseProjectConfig.storageBucket
    ? `gs://${firebaseProjectConfig.storageBucket.replace(/^gs:\/\//, '')}`
    : undefined
);

// 5. Cloud Functions (linked to existing project)
export const functions: Functions = getFunctions(app);

// 6. Firebase Cloud Messaging (auto-initialized when supported by browser/WebView)
let messagingPromise: Promise<Messaging | null> | null = null;
export function getCloudMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!messagingPromise) {
    messagingPromise = isMessagingSupported()
      .then((supported) => (supported ? getMessaging(app) : null))
      .catch(() => null);
  }
  return messagingPromise;
}

let authInitPromise: Promise<FirebaseUser | null> | null = null;

/**
 * Ensures Firebase Auth is active so Firestore security rules pass seamlessly.
 * If no user is signed in, signs in anonymously or waits for active user session.
 */
export async function ensureFirebaseAuth(): Promise<FirebaseUser | null> {
  if (auth?.currentUser) return auth.currentUser;
  if (authInitPromise) return authInitPromise;

  authInitPromise = new Promise((resolve) => {
    try {
      const unsub = onAuthStateChanged(auth, async (user) => {
        unsub();
        if (user) {
          resolve(user);
        } else {
          try {
            const anon = await signInAnonymously(auth);
            resolve(anon.user);
          } catch {
            resolve(null);
          }
        }
      });
    } catch (e) {
      console.warn('[Firebase] onAuthStateChanged warning:', e);
      resolve(null);
    }
  });

  return authInitPromise;
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection().catch(() => {});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.warn('Firestore Operation Info:', JSON.stringify(errInfo));
  return errInfo;
}
