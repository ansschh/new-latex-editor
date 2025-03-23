// components/FirebaseDebugPanel.tsx
"use client";

import React, { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  getDocs, 
  query, 
  where, 
  getDoc, 
  doc 
} from "firebase/firestore";
import { authenticateWithFirebase } from "@/lib/firebase-auth";

interface FirebaseDebugPanelProps {
  userId: string;
  projectId?: string;
}

const FirebaseDebugPanel: React.FC<FirebaseDebugPanelProps> = ({ userId, projectId }) => {
  const [status, setStatus] = useState("Ready");
  const [isExpanded, setIsExpanded] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<any>(null);

  // Fetch project data if projectId is provided
  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      try {
        const projectRef = doc(db, "projects", projectId);
        const projectDoc = await getDoc(projectRef);
        if (projectDoc.exists()) {
          setProjectData({
            id: projectDoc.id,
            ...projectDoc.data()
          });
        }
      } catch (err) {
        console.error("Error fetching project:", err);
      }
    };

    fetchProject();
  }, [projectId]);

  const checkAuthState = async () => {
    setStatus("Checking auth state...");
    setError(null);
    setResult(null);

    try {
      // Try to authenticate with Firebase
      setStatus("Authenticating with Firebase...");
      const fbUser = await authenticateWithFirebase(userId);
      
      setResult({
        authenticated: true,
        userId: userId,
        firebaseUid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
      });
      
      setStatus("Success");
    } catch (err: any) {
      console.error("Firebase auth test failed:", err);
      setError(err.message);
      setStatus("Failed");
    }
  };

  const testFirestore = async () => {
    setStatus("Testing Firestore...");
    setError(null);
    setResult(null);
    
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
      
      // 3. Read test documents
      setStatus("Reading documents...");
      const q = query(
        collection(db, "debug_tests"),
        where("userId", "==", userId)
      );
      const querySnapshot = await getDocs(q);
      const docs: any[] = [];
      querySnapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      
      // 4. Check projects collection
      setStatus("Checking projects collection...");
      const projectsQuery = query(
        collection(db, "projects"),
        where("owner", "==", userId)
      );
      const projectsSnapshot = await getDocs(projectsQuery);
      const projects: any[] = [];
      projectsSnapshot.forEach((doc) => {
        projects.push({ id: doc.id, title: doc.data().title });
      });
      
      // 5. Check project_files collection if we have a projectId
      let projectFiles: any[] = [];
      if (projectId) {
        setStatus("Checking project files...");
        const filesQuery = query(
          collection(db, "project_files"),
          where("projectId", "==", projectId)
        );
        const filesSnapshot = await getDocs(filesQuery);
        filesSnapshot.forEach((doc) => {
          projectFiles.push({ 
            id: doc.id, 
            name: doc.data().name,
            type: doc.data().type,
            parentId: doc.data().parentId
          });
        });
      }
      
      setResult({
        authenticated: true,
        userId: userId,
        firebaseUid: fbUser.uid,
        testDocId: testDocRef.id,
        testsCount: docs.length,
        projects: projects,
        projectFiles: projectFiles
      });
      
      setStatus("Success");
    } catch (err: any) {
      console.error("Firebase test failed:", err);
      setError(err.message);
      setStatus("Failed");
    }
  };

  const initializeProjectFiles = async () => {
    if (!projectId) {
      setError("No project ID provided");
      return;
    }
    
    setStatus("Initializing project files...");
    setError(null);
    setResult(null);
    
    try {
      // Authenticate with Firebase
      const fbUser = await authenticateWithFirebase(userId);
      
      // Create main.tex file
      const mainFileRef = await addDoc(collection(db, "project_files"), {
        name: "main.tex",
        type: "file",
        projectId,
        parentId: null,
        ownerId: userId,
        content: projectData?.content || "% Start typing your LaTeX content here",
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      });
      
      // Create references.bib file
      const bibFileRef = await addDoc(collection(db, "project_files"), {
        name: "references.bib",
        type: "file",
        projectId,
        parentId: null,
        ownerId: userId,
        content: "@article{example,\n  author = {Author Name},\n  title = {Article Title},\n  journal = {Journal Name},\n  year = {2023}\n}",
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      });
      
      // Create figures folder
      const figuresFolderRef = await addDoc(collection(db, "project_files"), {
        name: "figures",
        type: "folder",
        projectId,
        parentId: null,
        ownerId: userId,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      });
      
      // Create sections folder
      const sectionsFolderRef = await addDoc(collection(db, "project_files"), {
        name: "sections",
        type: "folder",
        projectId,
        parentId: null,
        ownerId: userId,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      });
      
      // Create introduction.tex in sections folder
      const introFileRef = await addDoc(collection(db, "project_files"), {
        name: "introduction.tex",
        type: "file",
        projectId,
        parentId: sectionsFolderRef.id,
        ownerId: userId,
        content: "% Introduction section\n\\section{Introduction}\nThis is the introduction of my document.",
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      });
      
      setResult({
        success: true,
        files: [
          { id: mainFileRef.id, name: "main.tex", type: "file" },
          { id: bibFileRef.id, name: "references.bib", type: "file" },
          { id: figuresFolderRef.id, name: "figures", type: "folder" },
          { id: sectionsFolderRef.id, name: "sections", type: "folder" },
          { id: introFileRef.id, name: "introduction.tex", type: "file", parent: "sections" },
        ]
      });
      
      setStatus("Success");
    } catch (err: any) {
      console.error("Failed to initialize project files:", err);
      setError(err.message);
      setStatus("Failed");
    }
  };

  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div 
        className="bg-gray-700 p-3 cursor-pointer flex justify-between items-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-gray-200 font-medium flex items-center">
          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
            error ? 'bg-red-500' : status === 'Success' ? 'bg-green-500' : 'bg-yellow-500'
          }`}></span>
          Firebase Debug
        </h3>
        <span className="text-gray-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
      </div>
      
      {isExpanded && (
        <div className="p-4">
          <div className="mb-3">
            <p className="text-gray-300 text-sm"><strong>User ID:</strong> {userId}</p>
            {projectId && (
              <p className="text-gray-300 text-sm mt-1"><strong>Project ID:</strong> {projectId}</p>
            )}
            <p className="text-gray-300 text-sm mt-1"><strong>Status:</strong> {status}</p>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            <button 
              onClick={checkAuthState}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Check Auth
            </button>
            <button 
              onClick={testFirestore}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Test Firestore
            </button>
            {projectId && (
              <button 
                onClick={initializeProjectFiles}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                Init Project Files
              </button>
            )}
          </div>
          
          {error && (
            <div className="mb-3 p-2 bg-red-900/50 border border-red-700 rounded">
              <p className="text-red-300 text-sm break-all">{error}</p>
            </div>
          )}
          
          {result && (
            <div className="mb-3">
              <div className="p-2 bg-gray-700 rounded mb-2">
                <p className="text-green-400 text-sm mb-1">{result.authenticated ? "✓ Authenticated" : "✗ Not authenticated"}</p>
                {result.userId && <p className="text-gray-300 text-xs">User ID: {result.userId}</p>}
                {result.firebaseUid && <p className="text-gray-300 text-xs">Firebase UID: {result.firebaseUid}</p>}
              </div>
              
              {result.projects && (
                <div className="p-2 bg-gray-700 rounded mb-2">
                  <p className="text-gray-300 text-sm mb-1">Projects: {result.projects.length}</p>
                  <div className="max-h-20 overflow-y-auto">
                    {result.projects.map((project: any) => (
                      <div key={project.id} className="text-xs text-gray-400">{project.title} ({project.id.substring(0, 8)}...)</div>
                    ))}
                  </div>
                </div>
              )}
              
              {result.projectFiles && result.projectFiles.length > 0 && (
                <div className="p-2 bg-gray-700 rounded mb-2">
                  <p className="text-gray-300 text-sm mb-1">Project Files: {result.projectFiles.length}</p>
                  <div className="max-h-20 overflow-y-auto">
                    {result.projectFiles.map((file: any) => (
                      <div key={file.id} className="text-xs text-gray-400">
                        {file.name} ({file.type})
                        {file.parentId && <span className="text-gray-500"> - Child of {file.parentId.substring(0, 6)}...</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {result.files && (
                <div className="p-2 bg-gray-700 rounded">
                  <p className="text-green-400 text-sm mb-1">✓ Created {result.files.length} files</p>
                  <div className="max-h-24 overflow-y-auto">
                    {result.files.map((file: any) => (
                      <div key={file.id} className="text-xs text-gray-400">
                        {file.name} ({file.type})
                        {file.parent && <span className="text-gray-500"> - In {file.parent}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="text-gray-400 text-xs mt-2">
            After making changes, refresh the page to see updates.
          </div>
        </div>
      )}
    </div>
  );
};

export default FirebaseDebugPanel;