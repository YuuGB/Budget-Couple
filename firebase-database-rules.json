import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, get, remove } from "firebase/database";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";

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
const auth = getAuth(app);

// Each account (foyer) has its own isolated data, stored under its own uid.
// The old shared path (used before accounts existed) is kept as LEGACY_PATH
// only so existing users can import their data once after creating an account.
const LEGACY_PATH = "budget-data";

function userDataPath(uid) {
  return `users/${uid}/budget-data`;
}

/**
 * Subscribe to real-time updates of this user's budget data.
 * Calls `callback(data)` immediately with the current value, then again
 * every time the data changes on any device signed into the same account.
 * Returns an unsubscribe function.
 */
export function subscribeToBudgetData(uid, callback) {
  const dataRef = ref(db, userDataPath(uid));
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
 * Write the full budget data object for this user. Overwrites whatever was there.
 */
export function saveBudgetData(uid, data) {
  const dataRef = ref(db, userDataPath(uid));
  return set(dataRef, data);
}

/**
 * One-time read of the old shared (pre-account) data, if it still exists.
 * Used to offer a manual "import my old data" action after signing up.
 */
export async function fetchLegacyData() {
  const snapshot = await get(ref(db, LEGACY_PATH));
  return snapshot.val();
}

/**
 * Copy the legacy shared data into this user's own space, then remove the
 * old shared path entirely. This is important: without removing it, ANY
 * other new account (e.g. a family member signing up later) would also be
 * offered to import this same private data. Only the first person to import
 * it gets it, and it disappears for everyone else afterwards.
 */
export async function importLegacyDataForUser(uid, legacyData) {
  await saveBudgetData(uid, legacyData);
  await remove(ref(db, LEGACY_PATH));
}

// ---- Authentication ----

export function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signOutUser() {
  return firebaseSignOut(auth);
}

/**
 * Subscribe to auth state (logged in / logged out). Calls callback(user)
 * with either a Firebase user object or null. Returns an unsubscribe function.
 */
export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
