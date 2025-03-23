// app/editor/[id]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { 
  Loader, Save, Download, Play, Edit, Eye, Layout, Menu,
  FileText, Folder, RefreshCw, ChevronRight, ChevronDown,
  ZoomIn, ZoomOut, RotateCw, X, FileUp, Trash, Copy, ChevronLeft
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
  
  // Render loading state
  if (!isLoaded || isInitializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center">
          <Loader className="h-10 w-10 text-blue-500 animate-spin" />
          <p className="mt-4 text-gray-400">Loading editor...</p>
          <p className="text-sm text-gray-500">Please wait while we set up your workspace</p>
        </div>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900">
        <div className="max-w-md p-6 bg-gray-800 rounded-lg shadow-lg text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-200 mb-2">Access Error</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <a 
            href="/sign-in"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors inline-block"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }
  
  // Render editor with the project ID and user ID
  return (
    <ModernEditor 
      projectId={id as string} 
      userId={userId as string} 
    />
  );
}