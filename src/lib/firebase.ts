import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const schoolEmailDomain = 'handong.ac.kr'
export const isFirebaseConfigured = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
].every((value) => typeof value === 'string' && value.trim().length > 0)

export const firebaseApp = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null

export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null
export const googleProvider = firebaseApp ? new GoogleAuthProvider() : null

if (googleProvider) {
  googleProvider.setCustomParameters({
    prompt: 'select_account',
    hd: schoolEmailDomain,
  })
}

export function isAllowedSchoolEmail(email?: string | null) {
  return Boolean(
    email && email.toLowerCase().endsWith(`@${schoolEmailDomain}`),
  )
}

let analyticsPromise: Promise<Analytics | null> | null = null

export function initAnalytics() {
  if (
    !firebaseApp ||
    !firebaseConfig.measurementId ||
    typeof window === 'undefined'
  ) {
    return Promise.resolve(null)
  }

  if (analyticsPromise) {
    return analyticsPromise
  }

  analyticsPromise = isSupported()
    .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
    .catch(() => null)

  return analyticsPromise
}
