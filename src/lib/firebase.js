import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Values from Firebase Console > Project Settings > General > Your apps > SDK setup
// apiKey and appId still need to be filled in from your Firebase project settings.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "to-gather-54dd7.firebaseapp.com",
  projectId: "to-gather-54dd7",
  storageBucket: "to-gather-54dd7.firebasestorage.app",
  messagingSenderId: "91532850410",
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
