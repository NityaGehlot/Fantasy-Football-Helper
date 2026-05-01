import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDo3jyq9cbSjGeSLmKbQE8ryNiiKJbc31Q",
  authDomain: "ffhelper-eb35a.firebaseapp.com",
  projectId: "ffhelper-eb35a",
  storageBucket: "ffhelper-eb35a.firebasestorage.app",
  messagingSenderId: "133040506561",
  appId: "1:133040506561:web:f35f6e4e88a3cbdf5ef640",
  measurementId: "G-PLK9BW8W66"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
