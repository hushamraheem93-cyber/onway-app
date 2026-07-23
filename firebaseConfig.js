// Legacy Firebase client config — kept for reference only.
// This file is not imported by any application code.
// The active config lives in client/lib/firebase.ts and uses EXPO_PUBLIC_* env vars.
//
// Values must be set in .env (see .env.example for all EXPO_PUBLIC_FIREBASE_* keys).

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            || '',
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        || '',
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         || '',
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             || '',
  measurementId:     process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID     || '',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
