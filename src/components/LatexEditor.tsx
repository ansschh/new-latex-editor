import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { doc, getDoc, updateDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authenticateWithFirebase } from "@/lib/firebase-auth";
import { Loader, Save, Download, Play, Edit, Eye, Layout, Menu, FileText, Folder } from "lucide-react";
import { useRouter } from "next/navigation";
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { compileLatex } from "@/services/latexService";

// Import project file tree component
import ProjectFileTree from "./ProjectFileTree";

// Import debug panel
import FirebaseDebugPanel from "./FirebaseDebugPanel";

// Dynamically import PdfViewer to avoid SSR issues
const CSPSafePdfViewer = dynamic(() => import('../components/PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-gray-100">
      <Loader className="h-8 w-8 text-blue-500 animate-spin" />
    </div>
  ),
});

interface BasicEditorProps {
  projectId: string;
  userId: string;
  debug?: boolean;
}

const BasicEditor: React.FC<BasicEditorProps> = ({ projectId, userId, debug = true }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<any>(null);
  const [code, setCode] = useState("");
  const [isSaved, setIsSaved] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"code" | "split" | "pdf">("split");
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationError, setCompilationError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<string | ArrayBuffer | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [autoCompile, setAutoCompile] = useState(false);
  const [compileTimeout, setCompileTimeout] = useState<NodeJS.Timeout | null>(null);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>("");

  // Debugging logs
  useEffect(() => {
    console.log("BasicEditor mounted with:", { projectId, userId });
  }, [projectId, userId]);

  // Handle auto-compilation
  useEffect(() => {
    if (!autoCompile || isSaved) return;

    // Clear previous timeout
    if (compileTimeout) {
      clearTimeout(compileTimeout);
    }

    // Set a new timeout to compile after typing stops
    const timeout = setTimeout(() => {
      handleCompile();
    }, 2000); // 2 second delay

    setCompileTimeout(timeout);

    // Cleanup
    return () => {
      if (compileTimeout) clearTimeout(compileTimeout);
    };
  }, [code, autoCompile, isSaved]);

  // Load project data
  useEffect(() => {
    if (!projectId || !userId) {
      console.error("Missing projectId or userId");
      setError("Missing project ID or user ID");
      setLoading(false);
      return;
    }

    const fetchProjectData = async () => {
      try {
        console.log("Fetching project data...");
        setLoading(true);
        
        // Authenticate with Firebase
        console.log("Authenticating with Firebase...");
        await authenticateWithFirebase(userId);
        
        // Get project details
        console.log("Getting project document...");
        const projectRef = doc(db, "projects", projectId);
        const projectDoc = await getDoc(projectRef);
        
        if (!projectDoc.exists()) {
          console.error("Project not found");
          throw new Error("Project not found");
        }
        
        console.log("Project data retrieved:", projectDoc.data());
        const project = {
          id: projectDoc.id,
          ...projectDoc.data()
        };
        
        setProjectData(project);
        
        // The initial content will now be loaded from the file selection
        // through the ProjectFileTree component
        
        setLoading(false);
      } catch (error) {
        console.error("Error fetching project data:", error);
        setError(error instanceof Error ? error.message : "An error occurred");
        setLoading(false);
      }
    };
    
    console.log("Starting data fetch...");
    fetchProjectData();
  }, [projectId, userId]);

  // Handle code changes
  const handleCodeChange = (value: string) => {
    setCode(value);
    setIsSaved(false);
  };

  // Handle file selection from the file tree
  const handleFileSelect = (fileId: string, fileName: string, content: string) => {
    // If there are unsaved changes, prompt the user
    if (!isSaved && currentFileId) {
      if (window.confirm("You have unsaved changes. Do you want to save them before switching files?")) {
        handleSave().then(() => {
          setCurrentFileId(fileId);
          setCurrentFileName(fileName);
          setCode(content);
          setIsSaved(true);
        });
        return;
      }
    }
    
    setCurrentFileId(fileId);
    setCurrentFileName(fileName);
    setCode(content);
    setIsSaved(true);
  };

  // Save current file
  const handleSave = async () => {
    if (!currentFileId) {
      console.error("No file selected");
      showNotification("No file selected to save", "error");
      return;
    }
    
    try {
      // Save to project file document
      console.log("Saving content to file document");
      const fileRef = doc(db, "projectFiles", currentFileId);
      await updateDoc(fileRef, {
        content: code,
        updatedAt: serverTimestamp()
      });
      
      // Also update project's lastModified timestamp
      const projectRef = doc(db, "projects", projectId);
      await updateDoc(projectRef, {
        lastModified: serverTimestamp()
      });
      
      setIsSaved(true);
      showNotification("File saved successfully");
    } catch (error) {
      console.error("Error saving document:", error);
      showNotification("Failed to save document", "error");
    }
  };

  // Compile LaTeX
  const handleCompile = async () => {
    if (isCompiling) return;

    // If no file is selected, can't compile
    if (!currentFileId) {
      showNotification("Please select a file to compile", "error");
      return;
    }
    
    // Check if the current file is a .tex file
    if (!currentFileName.toLowerCase().endsWith('.tex')) {
      showNotification("Only .tex files can be compiled", "error");
      return;
    }

    setIsCompiling(true);
    setCompilationError(null);
    setHtmlPreview(null);

    try {
      console.log("Starting LaTeX compilation...");
      
      // Save current changes first
      if (!isSaved) {
        await handleSave();
      }
      
      // Compile the document
      const result = await compileLatex(code);
      console.log("Compilation result:", result);
      
      if (result.success) {
        if (result.pdfData) {
          setPdfData(result.pdfData);
          setHtmlPreview(result.htmlPreview || null);
          setCompilationError(null);
        } else if (result.htmlPreview) {
          setHtmlPreview(result.htmlPreview);
          setPdfData(null);
          setCompilationError(null);
        } else {
          setCompilationError("No content returned from compilation");
        }
      } else {
        console.error("Compilation failed:", result.error);
        setCompilationError(result.error || "Unknown compilation error");
        setPdfData(null);
        setHtmlPreview(null);
      }
    } catch (error) {
      console.error("Error compiling LaTeX:", error);
      setCompilationError(
        error instanceof Error ? error.message : "Unknown compilation error"
      );
      setPdfData(null);
      setHtmlPreview(null);
    } finally {
      setIsCompiling(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = () => {
    if (!pdfData) {
      // If no compiled PDF, compile it first
      if (!isCompiling) {
        handleCompile().then(() => {
          if (pdfData) {
            triggerPdfDownload();
          }
        });
      }
      return;
    }

    triggerPdfDownload();
  };

  // Helper function to trigger the actual download
  const triggerPdfDownload = () => {
    if (typeof pdfData === 'string' && pdfData.startsWith('data:application/pdf')) {
      // Create temporary link
      const link = document.createElement('a');
      link.href = pdfData;
      link.download = `${currentFileName || projectData?.title || "document"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showNotification(`PDF downloaded successfully`);
    } else if (pdfData instanceof ArrayBuffer) {
      // Handle ArrayBuffer data
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentFileName || projectData?.title || "document"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL
      setTimeout(() => URL.revokeObjectURL(url), 100);

      showNotification(`PDF downloaded successfully`);
    } else {
      showNotification("Could not download PDF - try compiling first", "error");
    }
  };

  // Helper function to show notifications
  const showNotification = (message: string, type = "success") => {
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg z-50 ${
      type === "success" ? "bg-green-600 text-white" :
      type === "error" ? "bg-red-600 text-white" :
      "bg-blue-600 text-white"
    }`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  };

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  // Render loading state
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center">
          <Loader className="h-10 w-10 text-blue-500 animate-spin" />
          <p className="mt-4 text-gray-400">Loading editor...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="max-w-md p-6 bg-gray-800 rounded-lg shadow-lg text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-200 mb-2">Error Loading Project</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <div className="flex flex-col space-y-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <header className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center">
        {/* Left section */}
        <div className="flex items-center">
          <button
            className="p-1.5 rounded-md hover:bg-gray-700 mr-2 text-gray-300 focus:outline-none"
            onClick={toggleSidebar}
            title="Toggle Sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="mr-4 flex items-center">
            <button 
              onClick={() => router.push("/dashboard")}
              className="text-gray-300 hover:text-white mr-2">
              &larr; Dashboard
            </button>
            <h1 className="font-medium text-gray-200">{projectData?.title || "Loading..."}</h1>
            {!isSaved && <span className="ml-2 text-yellow-500 text-lg">•</span>}
          </div>
        </div>

        {/* Middle section (spacer) */}
        <div className="flex-1"></div>

        {/* Right section */}
        <div className="flex items-center space-x-2">
          {/* View toggle buttons */}
          <div className="hidden md:flex items-center bg-gray-700 rounded-md overflow-hidden border border-gray-600 mr-2">
            <button
              className={`px-3 py-1.5 flex items-center text-sm ${
                viewMode === "code"
                  ? "bg-gray-600 text-white"
                  : "text-gray-300 hover:bg-gray-600"
              }`}
              onClick={() => setViewMode("code")}
            >
              <Edit className="h-4 w-4 mr-1.5" />
              <span className="hidden lg:inline">Code</span>
            </button>
            <button
              className={`px-3 py-1.5 flex items-center text-sm ${
                viewMode === "split"
                  ? "bg-gray-600 text-white"
                  : "text-gray-300 hover:bg-gray-600"
              }`}
              onClick={() => setViewMode("split")}
            >
              <Layout className="h-4 w-4 mr-1.5" />
              <span className="hidden lg:inline">Split</span>
            </button>
            <button
              className={`px-3 py-1.5 flex items-center text-sm ${
                viewMode === "pdf"
                  ? "bg-gray-600 text-white"
                  : "text-gray-300 hover:bg-gray-600"
              }`}
              onClick={() => setViewMode("pdf")}
            >
              <Eye className="h-4 w-4 mr-1.5" />
              <span className="hidden lg:inline">PDF</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSave}
              disabled={isSaved || !currentFileId}
              className={`flex items-center px-3 py-1.5 rounded-md ${
                isSaved || !currentFileId
                  ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              } text-sm transition-colors`}
              title="Save (Ctrl+S)"
            >
              <Save className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Save</span>
            </button>

            <button
              onClick={handleCompile}
              disabled={isCompiling || !currentFileId}
              className={`flex items-center px-3 py-1.5 rounded-md ${
                isCompiling || !currentFileId
                  ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                  : "bg-teal-600 hover:bg-teal-700 text-white"
              } text-sm transition-colors`}
              title="Compile (Ctrl+Enter)"
            >
              {isCompiling ? (
                <>
                  <Loader className="h-4 w-4 mr-1.5 animate-spin" />
                  <span className="hidden sm:inline">Compiling...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Compile</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={!pdfData}
              className={`flex items-center px-3 py-1.5 rounded-md ${
                !pdfData
                  ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                  : "bg-gray-700 hover:bg-gray-600 text-white"
              } text-sm transition-colors`}
              title="Download PDF"
            >
              <Download className="h-4 w-4 mr-1.5" />
              <span className="hidden md:inline">Download</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {!isSidebarCollapsed && (
          <div className="w-64 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
            <ProjectFileTree 
              projectId={projectId}
              userId={userId}
              onFileSelect={handleFileSelect}
              currentFileId={currentFileId}
            />
          </div>
        )}

        {/* Editor and Preview Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className={`flex flex-1 ${viewMode === "split" ? "flex-row" : "flex-col"}`}>
            {/* Code Editor */}
            {(viewMode === "code" || viewMode === "split") && (
              <div 
                className={`bg-gray-900 ${
                  viewMode === "split" ? "w-1/2" : "w-full"
                } overflow-hidden`}
              >
                <CodeMirror
                  value={code}
                  height="100%"
                  extensions={[StreamLanguage.define(stex)]}
                  onChange={handleCodeChange}
                  theme="dark"
                  basicSetup={{
                    lineNumbers: true,
                    highlightActiveLineGutter: true,
                    highlightSpecialChars: true,
                    foldGutter: true,
                    drawSelection: true,
                    dropCursor: true,
                    allowMultipleSelections: true,
                    indentOnInput: true,
                    syntaxHighlighting: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    autocompletion: true,
                    rectangularSelection: true,
                    crosshairCursor: true,
                    highlightActiveLine: true,
                    highlightSelectionMatches: true,
                    closeBracketsKeymap: true,
                    searchKeymap: true,
                    foldKeymap: true,
                    completionKeymap: true,
                    lintKeymap: true,
                  }}
                />
              </div>
            )}

            {/* PDF Preview */}
            {(viewMode === "pdf" || viewMode === "split") && (
              <div 
                className={`${
                  viewMode === "split" ? "w-1/2" : "w-full"
                } overflow-hidden border-l border-gray-700`}
              >
                <CSPSafePdfViewer
                  pdfData={pdfData}
                  isLoading={isCompiling}
                  error={compilationError}
                  htmlPreview={htmlPreview || undefined}
                  documentTitle={currentFileName || projectData?.title || "document"}
                />
              </div>
            )}
          </div>

          {/* Status bar */}
          <div className="h-6 bg-gray-800 border-t border-gray-700 flex items-center px-4 text-xs text-gray-400">
            <div className="flex-1 flex items-center">
              {currentFileName ? (
                <>
                  <span>{currentFileName}</span>
                  <span className="mx-2">•</span>
                  <span>{code.split('\n').length} lines</span>
                  {!isSaved && (
                    <>
                      <span className="mx-2">•</span>
                      <span className="text-yellow-500">Unsaved changes</span>
                    </>
                  )}
                </>
              ) : (
                <span>No file selected</span>
              )}
            </div>
            <div className="flex items-center">
              <label className="flex items-center mr-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCompile}
                  onChange={(e) => setAutoCompile(e.target.checked)}
                  className="mr-1.5 h-3 w-3"
                />
                <span>Auto-compile</span>
              </label>
              <span>LaTeX Editor</span>
            </div>
          </div>
        </div>
      </div>

      {/* Debug Panel (conditionally rendered) */}
      {debug && <FirebaseDebugPanel userId={userId} projectId={projectId} />}
    </div>
  );
};

export default BasicEditor;