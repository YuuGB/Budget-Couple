import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

// Configuration Firebase de ce projet (budget-couple).
// Ces clés sont faites pour être visibles côté client, ce n'est pas un secret.
const firebaseConfig = {
  apiKey: "AIzaSyCtKkAfySywU5da6T_EH9pkt1kO7Pc1py0",
  authDomain: "budget-couple-6df09.firebaseapp.com",
  databaseURL: "https://budget-couple-6df09-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "budget-couple-6df09",
  storageBucket: "budget-couple-6df09.firebasestorage.app",
  messagingSenderId: "345161502364",
  appId: "1:345161502364:web:7c41f2015fb48d1ce82759",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// The whole app's shared state is stored under this single node,
// so both phones read/write the exact same record.
const DATA_PATH = "budget-data";

/**
 * Subscribe to real-time updates of the shared budget data.
 * Calls `callback(data)` immediately with the current value, then again
 * every time the data changes on any device. Returns an unsubscribe function.
 */
export function subscribeToBudgetData(callback) {
  const dataRef = ref(db, DATA_PATH);
  const unsubscribe = onValue(
    dataRef,
    (snapshot) => {
      callback(snapshot.val());
    },
    (error) => {
      console.error("Firebase read error:", error);
      callback(null, error);
    }
  );
  return unsubscribe;
}

/**
 * Write the full shared budget data object. Overwrites whatever was there.
 */
export function saveBudgetData(data) {
  const dataRef = ref(db, DATA_PATH);
  return set(dataRef, data);
}
