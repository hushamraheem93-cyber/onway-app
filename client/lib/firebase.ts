import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase client config — values are loaded from EXPO_PUBLIC_* environment
// variables so no credentials are baked into the source code.
//
// Set these in your .env file BEFORE running:
//   npm run expo:static:build      (mobile bundle)
//   npm run server:dev             (web preview)
//
// Values come from: Firebase Console → Project Settings → Your apps → SDK config
const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            || '',
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        || '',
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         || '',
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             || '',
  measurementId:     process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID     || '',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };
