import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCmt-0JscXKAGNOmamyMalrtPH7NXxZNBg',
  authDomain: 'onway-74c20.firebaseapp.com',
  projectId: 'onway-74c20',
  storageBucket: 'onway-74c20.firebasestorage.app',
  messagingSenderId: '116297695107',
  appId: '1:116297695107:web:772d3cc6f62f5e04bbc0b6',
  measurementId: 'G-L0CT34EMBE'
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };
