// app/editor/[id]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { 
  Loader, AlertCircle
} from "lucide-react";

// Dynamically import the editor to avoid SSR issues
const ModernEditor = dynamic(() => import("../../../components/LatexEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-900">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-gray-400">Loading editor...</p>
      </div>
    </div>
  ),
});

export default function EditorPage() {
  const { id } = useParams();
  const { userId, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Handle authentication and initialization
  useEffect(() => {
    // Wait for auth to load
    if (!isLoaded) return;
    
    // Check if user is signed in
    if (!isSignedIn || !userId) {
      setError("You must be signed in to access the editor");
      setIsInitializing(false);
      return;
    }
    
    // Continue with initialization
    setIsInitializing(false);
  }, [isLoaded, isSignedIn, userId]);

  // Redirect back to dashboard on error
  const handleBackToDashboard = () => {
    router.push("/dashboard");
  };
  
  // Render loading state
  if (!isLoaded || isInitializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center">
          <Loader className="h-10 w-10 text-blue-500 animate-spin" />
          <p className="mt-4 text-gray-400">Loading editor...</p>
          <p className="text-sm text-gray-500 mt-2">Setting up your workspace...</p>
        </div>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900">
        <div className="max-w-md p-8 bg-gray-800 rounded-lg shadow-lg text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-red-900/30 p-3">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-200 mb-3">Access Error</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <div className="flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-3">
            <button 
              onClick={handleBackToDashboard}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
            >
              Back to Dashboard
            </button>
            <a 
              href="/sign-in"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors inline-block"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }
  
  // Render editor with the project ID and user ID
  return (
    <ModernEditor 
      projectId={Array.isArray(id) ? id[0] : id as string} 
      userId={userId as string} 
    />
  );
}