// components/FirebaseDebug.jsx
"use client";

import { useEffect, useState } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { authenticateWithFirebase } from "@/lib/firebase-auth";

export default function FirebaseDebug({ userId }) {
  const [status, setStatus] = useState("Idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const testFirebase = async () => {
    setStatus("Testing...");
    setResult(null);
    setError(null);
    
    try {
      // 1. Authenticate with Firebase
      setStatus("Authenticating...");
      const fbUser = await authenticateWithFirebase(userId);
      
      // 2. Write a test document
      setStatus("Writing test document...");
      const testDocRef = await addDoc(collection(db, "debug_tests"), {
        userId: userId,
        firebaseUid: fbUser.uid,
        timestamp: serverTimestamp(),
        test: "debug"
      });
      
      // 3. Read all documents
      setStatus("Reading documents...");
      const querySnapshot = await getDocs(collection(db, "debug_tests"));
      const docs = [];
      querySnapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      
      setResult({
        authenticated: true,
        userId: userId,
        firebaseUid: fbUser.uid,
        docsWritten: 1,
        docsRead: docs.length,
        docs: docs.map(d => ({ id: d.id, userId: d.userId }))
      });
      setStatus("Success");
    } catch (err) {
      console.error("Firebase debug test failed:", err);
      setError(err.message);
      setStatus("Failed");
    }
  };

  return (
    <div className="p-4 border border-gray-300 rounded-md bg-gray-50 mb-4">
      <h3 className="text-lg font-medium mb-2">Firebase Debugging</h3>
      <div className="mb-2">
        <p><strong>Current user:</strong> {userId || "None"}</p>
        <p><strong>Status:</strong> {status}</p>
      </div>
      <button 
        onClick={testFirebase}
        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Test Firebase Connection
      </button>
      
      {error && (
        <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-red-700">
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}
      
      {result && (
        <div className="mt-2 p-2 bg-green-100 border border-green-300 rounded">
          <p><strong>Authentication:</strong> {result.authenticated ? "Success" : "Failed"}</p>
          <p><strong>User ID:</strong> {result.userId}</p>
          <p><strong>Firebase UID:</strong> {result.firebaseUid}</p>
          <p><strong>Docs written:</strong> {result.docsWritten}</p>
          <p><strong>Docs read:</strong> {result.docsRead}</p>
          <details className="mt-2">
            <summary>Document details</summary>
            <pre className="p-2 bg-gray-100 mt-1 text-xs overflow-auto">
              {JSON.stringify(result.docs, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}