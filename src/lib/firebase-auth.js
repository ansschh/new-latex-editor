// lib/firebase-auth.js
import { auth } from "./firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";

// Create a Firebase email from Clerk ID
const createFirebaseEmail = (clerkUserId) => {
  return `${clerkUserId}@latexscholar.app`;
};

// Create a deterministic password from Clerk ID
const createFirebasePassword = (clerkUserId) => {
  return `firebase-${clerkUserId}`;
};

export async function authenticateWithFirebase(clerkUserId) {
  if (!clerkUserId) return null;
  
  try {
    console.log("Authenticating with Firebase for user:", clerkUserId);
    
    const email = createFirebaseEmail(clerkUserId);
    const password = createFirebasePassword(clerkUserId);
    
    try {
      // Try to sign in first
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("Firebase sign in successful");
      
      // Important: Make sure the Firebase UID matches the Clerk UID for Firestore queries
      if (userCredential.user.uid !== clerkUserId) {
        console.log("Warning: Firebase UID doesn't match Clerk UID");
      }
      
      return userCredential.user;
    } catch (signInError) {
      // If sign in fails, create the user
      console.log("Firebase sign in failed, creating new user");
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Set display name to the Clerk ID for reference
      await updateProfile(userCredential.user, {
        displayName: clerkUserId
      });
      
      console.log("Firebase user created successfully");
      
      // Important: Make sure the Firebase UID matches the Clerk UID for Firestore queries
      if (userCredential.user.uid !== clerkUserId) {
        console.log("Warning: Firebase UID doesn't match Clerk UID", {
          firebaseUid: userCredential.user.uid,
          clerkUid: clerkUserId
        });
      }
      
      return userCredential.user;
    }
  } catch (error) {
    console.error("Firebase authentication error:", error);
    throw error;
  }
}