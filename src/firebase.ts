import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, updateProfile, updateEmail, updatePassword } from 'firebase/auth';
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
      let preAssignedData: any = {};

      if (!querySnapshot.empty) {
        const preDoc = querySnapshot.docs[0];
        preAssignedData = preDoc.data();
        preAssignedRole = preAssignedData.role as UserRole;
        preAssignedDocId = preDoc.id;
        isApproved = true; // Pre-assigned by admin/teacher
      }

      try {
        let username = preAssignedData.username || user.email?.split('@')[0] || `user_${Date.now()}`;
        const isUnique = await checkUsernameUnique(username);
        if (!isUnique && !preAssignedData.username) {
          username = `${username}_${Math.random().toString(36).substr(2, 4)}`;
        }

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          username: username,
          displayName: user.displayName || preAssignedData.displayName,
          school: preAssignedData.school || 'Trường Tự do',
          class: preAssignedData.class || 'Tự do',
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

export const signUpWithEmail = async (email: string, pass: string, name: string, username?: string, school?: string, className?: string) => {
  try {
    // Check username uniqueness if provided
    if (username) {
      const isUnique = await checkUsernameUnique(username);
      if (!isUnique) {
        throw new Error('Tên đăng nhập này đã tồn tại.');
      }
    }

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
    let preAssignedData: any = {};

    if (!querySnapshot.empty) {
      const preDoc = querySnapshot.docs[0];
      preAssignedData = preDoc.data();
      preAssignedRole = preAssignedData.role as UserRole;
      preAssignedDocId = preDoc.id;
      isApproved = true;
    }

    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        username: username || preAssignedData.username || user.email.split('@')[0],
        displayName: name || preAssignedData.displayName,
        school: school || preAssignedData.school || 'Trường Tự do',
        class: className || preAssignedData.class || 'Tự do',
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

export const signInWithUsernameOrEmail = async (loginId: string, pass: string) => {
  try {
    let email = loginId;
    
    // Check if loginId is a username
    if (!loginId.includes('@')) {
      const q = query(collection(db, 'users'), where('username', '==', loginId));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        email = querySnapshot.docs[0].data().email;
      } else {
        throw new Error('Tên đăng nhập không tồn tại.');
      }
    }
    
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (error) {
    console.error('Error signing in:', error);
    throw error;
  }
};

export const checkUsernameUnique = async (username: string) => {
  const q = query(collection(db, 'users'), where('username', '==', username));
  const querySnapshot = await getDocs(q);
  return querySnapshot.empty;
};

export const checkEmailUnique = async (email: string) => {
  const q = query(collection(db, 'users'), where('email', '==', email));
  const querySnapshot = await getDocs(q);
  return querySnapshot.empty;
};

export const updateUserEmail = async (newEmail: string) => {
  if (auth.currentUser) {
    await updateEmail(auth.currentUser, newEmail);
    await setDoc(doc(db, 'users', auth.currentUser.uid), { email: newEmail }, { merge: true });
  }
};

export const updateUserPassword = async (newPass: string) => {
  if (auth.currentUser) {
    await updatePassword(auth.currentUser, newPass);
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
