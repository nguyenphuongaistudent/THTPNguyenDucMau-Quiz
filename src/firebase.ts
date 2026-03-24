import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, updateProfile, updateEmail, updatePassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, onSnapshot, addDoc, getDocs, deleteDoc, serverTimestamp, Timestamp, updateDoc, deleteField } from 'firebase/firestore';
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
    const trimmedLoginId = loginId.trim();
    let email = trimmedLoginId;
    let firestoreUser: any = null;
    let firestoreDocId: string | null = null;
    
    // Find user in Firestore first to get the correct email and check stored password
    const usersRef = collection(db, 'users');
    
    // Try exact match first
    let q = trimmedLoginId.includes('@') 
      ? query(usersRef, where('email', '==', trimmedLoginId))
      : query(usersRef, where('username', '==', trimmedLoginId));
    
    let querySnapshot = await getDocs(q);
    
    // If not found, try case-insensitive for email/username if they were stored differently
    if (querySnapshot.empty) {
      const lowerLoginId = trimmedLoginId.toLowerCase();
      if (trimmedLoginId.includes('@')) {
        q = query(usersRef, where('email', '==', lowerLoginId));
      } else {
        q = query(usersRef, where('username', '==', lowerLoginId));
      }
      querySnapshot = await getDocs(q);
    }
    
    if (!querySnapshot.empty) {
      firestoreUser = querySnapshot.docs[0].data();
      firestoreDocId = querySnapshot.docs[0].id;
      email = firestoreUser.email;
    } else if (!trimmedLoginId.includes('@')) {
      const error: any = new Error('Tên đăng nhập không tồn tại.');
      error.code = 'auth/user-not-found';
      throw error;
    }
    
    try {
      // Try normal sign in
      const result = await signInWithEmailAndPassword(auth, email, pass);
      return result.user;
    } catch (authError: any) {
      console.log('Auth error code:', authError.code);
      
      // If user not found in Auth OR invalid credential (could be enumeration protection)
      // AND we have a firestore user with a matching password
      const isUserNotFound = authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential';
      
      if (isUserNotFound && firestoreUser && firestoreUser.password === pass) {
        try {
          // Auto-create Auth account for imported user
          const result = await createUserWithEmailAndPassword(auth, email, pass);
          
          // Update Firestore document to link with the new UID and remove the plain text password
          await setDoc(doc(db, 'users', result.user.uid), {
            ...firestoreUser,
            uid: result.user.uid,
            updatedAt: serverTimestamp()
          });
          
          // Remove password from Firestore for security after first login
          await updateDoc(doc(db, 'users', result.user.uid), {
            password: deleteField()
          });

          // Delete the old "pre_" document if it was different
          if (firestoreDocId && firestoreDocId !== result.user.uid) {
            await deleteDoc(doc(db, 'users', firestoreDocId));
          }
          
          return result.user;
        } catch (createError: any) {
          // If user already exists in Auth but we got invalid-credential, it's actually a wrong password
          if (createError.code === 'auth/email-already-in-use') {
             const error: any = new Error('Mật khẩu không chính xác.');
             error.code = 'auth/wrong-password';
             throw error;
          }
          throw createError;
        }
      }
      
      // Map common errors to friendly messages with codes
      if (authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        const error: any = new Error('Mật khẩu không chính xác.');
        error.code = 'auth/wrong-password';
        throw error;
      }
      if (authError.code === 'auth/user-not-found') {
        const error: any = new Error('Tài khoản không tồn tại.');
        error.code = 'auth/user-not-found';
        throw error;
      }
      
      throw authError;
    }
  } catch (error) {
    console.error('Error signing in:', error);
    throw error;
  }
};

export const checkUsernameUnique = async (username: string) => {
  const q = query(collection(db, 'users'), where('username', '==', username.trim()));
  const querySnapshot = await getDocs(q);
  return querySnapshot.empty;
};

export const checkEmailUnique = async (email: string) => {
  const q = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()));
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
