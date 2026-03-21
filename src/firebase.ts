import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, updateProfile } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, onSnapshot, addDoc, getDocs, deleteDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { UserRole } from './types';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user exists in Firestore by UID
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const isAdminEmail = user.email === 'nguyenphuongaistudent@gmail.com';
    
    if (!userDoc.exists()) {
      // Check if there's a pre-assigned role for this email
      const q = query(collection(db, 'users'), where('email', '==', user.email));
      const querySnapshot = await getDocs(q);
      
      let preAssignedRole: UserRole = isAdminEmail ? 'admin' : 'student';
      let preAssignedDocId: string | null = null;
      let isApproved = isAdminEmail;

      if (!querySnapshot.empty) {
        const preDoc = querySnapshot.docs[0];
        preAssignedRole = preDoc.data().role as UserRole;
        preAssignedDocId = preDoc.id;
        isApproved = true; // Pre-assigned by admin/teacher
      }

      try {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: preAssignedRole,
          isApproved: isApproved,
          createdAt: serverTimestamp()
        });
        
        // If there was a pre-assigned doc with a different ID (e.g. random ID), delete it
        if (preAssignedDocId && preAssignedDocId !== user.uid) {
          await deleteDoc(doc(db, 'users', preAssignedDocId));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      }
    } else if (isAdminEmail && (userDoc.data()?.role !== 'admin' || !userDoc.data()?.isApproved)) {
      // Update existing user to admin if they have the admin email
      try {
        await setDoc(doc(db, 'users', user.uid), {
          role: 'admin',
          isApproved: true
        }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
    return user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const logout = () => signOut(auth);

export const signUpWithEmail = async (email: string, pass: string, name: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    const user = result.user;
    
    await updateProfile(user, { displayName: name });
    
    const isAdminEmail = user.email === 'nguyenphuongaistudent@gmail.com';
    
    // Check if there's a pre-assigned role for this email
    const q = query(collection(db, 'users'), where('email', '==', user.email));
    const querySnapshot = await getDocs(q);
    
    let preAssignedRole: UserRole = isAdminEmail ? 'admin' : 'student';
    let preAssignedDocId: string | null = null;
    let isApproved = isAdminEmail;

    if (!querySnapshot.empty) {
      const preDoc = querySnapshot.docs[0];
      preAssignedRole = preDoc.data().role as UserRole;
      preAssignedDocId = preDoc.id;
      isApproved = true;
    }

    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: name,
        role: preAssignedRole,
        isApproved: isApproved,
        createdAt: serverTimestamp()
      });
      
      if (preAssignedDocId && preAssignedDocId !== user.uid) {
        await deleteDoc(doc(db, 'users', preAssignedDocId));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
    
    return user;
  } catch (error) {
    console.error('Error signing up with email:', error);
    throw error;
  }
};

export const signInWithEmail = async (email: string, pass: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (error) {
    console.error('Error signing in with email:', error);
    throw error;
  }
};

export const sendPasswordReset = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

export const sendVerification = async () => {
  try {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};
