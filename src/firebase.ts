import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyB_yy833nzzffc7eDfex1oHRieRA56O3bU",
  authDomain: "warehouse-2404.firebaseapp.com",
  projectId: "warehouse-2404",
  storageBucket: "warehouse-2404.firebasestorage.app",
  messagingSenderId: "1074784828676",
  appId: "1:1074784828676:web:9437542bd764a476a9a451"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
