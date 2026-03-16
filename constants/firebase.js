import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCxhsQRoNbYdCOTVuw-phHlSEQI7dhNKYY",
  authDomain: "safekids-7b76f.firebaseapp.com",
  projectId: "safekids-7b76f",
  storageBucket: "safekids-7b76f.firebasestorage.app",
  messagingSenderId: "396637966437",
  appId: "1:396637966437:web:3590df3b62490d2a2ff68c"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);