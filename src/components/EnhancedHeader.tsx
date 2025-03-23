// components/EnhancedHeader.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Menu,
  Save,
  Download,
  Upload,
  Play,
  Loader,
  Edit,
  Eye,
  Layout,
  Settings,
  HelpCircle,
  LogOut,
  ChevronDown,
  User,
  X,
  Edit3
} from "lucide-react";
import Link from "next/link";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface HeaderProps {
  projectId?: string;
  projectName?: string;
  userId: string | null;
  activeFileName?: string;
  onSidebarToggle: () => void;
  viewMode: "code" | "split" | "pdf";
  setViewMode: (mode: "code" | "split" | "pdf") => void;
  onSave: () => void;
  onCompile: () => void;
  onDownload: () => void;
  isCompiling: boolean;
  isSaved: boolean;
  autoCompile: boolean;
  setAutoCompile: (value: boolean) => void;
  onRename?: (newName: string) => void;
}

const EnhancedHeader: React.FC<HeaderProps> = ({
  projectId,
  projectName = "Untitled Project",
  userId,
  activeFileName,
  onSidebarToggle,
  viewMode,
  setViewMode,
  onSave,
  onCompile,
  onDownload,
  isCompiling,
  isSaved,
  autoCompile,
  setAutoCompile,
  onRename
}) => {
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newProjectName, setNewProjectName] = useState(projectName);
  const settingsRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Focus rename input when it appears
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const toggleSettings = () => {
    setIsSettingsOpen(!isSettingsOpen);
  };

  const navigateToDashboard = () => {
    router.push("/dashboard");
  };

  const startRenaming = () => {
    setIsRenaming(true);
    setNewProjectName(projectName);
  };

  const handleRenameSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!newProjectName.trim() || newProjectName === projectName) {
      setIsRenaming(false);
      return;
    }

    try {
      if (projectId && onRename) {
        onRename(newProjectName.trim());

        // Also update project document
        const projectRef = doc(db, "projects", projectId);
        await updateDoc(projectRef, {
          title: newProjectName.trim(),
          lastModified: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("Error renaming project:", error);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleKeyboardShortcuts = (e: React.KeyboardEvent) => {
    // Handle keyboard shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onCompile();
    }
  };

  return (
    <header
      className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center"
      onKeyDown={handleKeyboardShortcuts}
    >
      {/* Left section */}
      <div className="flex items-center">
        <button
          className="p-1.5 rounded-md hover:bg-gray-700 mr-2 text-gray-300 focus:outline-none"
          onClick={onSidebarToggle}
          title="Toggle Sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center mr-2 text-gray-400">
          <button
            onClick={navigateToDashboard}
            className="mr-1 hover:text-gray-300"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="mr-4 flex items-center">
          {isRenaming ? (
            <form onSubmit={handleRenameSubmit} className="flex items-center">
              <input
                ref={renameInputRef}
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onBlur={handleRenameSubmit}
                className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </form>
          ) : (
            <div className="flex items-center cursor-pointer" onClick={startRenaming}>
              <h1 className="font-medium text-gray-200 mr-1.5">{projectName}</h1>
              <Edit3 className="h-3.5 w-3.5 text-gray-400 hover:text-gray-300" />
            </div>
          )}
          {!isRenaming && (
            <div className="flex items-center ml-2">
              <span className="mx-1 text-sm text-gray-500">/</span>
              <span className="text-sm text-gray-300">{activeFileName}</span>
              {!isSaved && <span className="ml-1 text-yellow-500 text-lg">•</span>}
            </div>
          )}
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
            onClick={onSave}
            className="flex items-center px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors"
            title="Save (Ctrl+S)"
          >
            <Save className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            onClick={onCompile}
            disabled={isCompiling}
            className={`flex items-center px-3 py-1.5 rounded-md ${
              isCompiling
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
            onClick={onDownload}
            className="flex items-center px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
            title="Download PDF"
          >
            <Download className="h-4 w-4 mr-1.5" />
            <span className="hidden md:inline">Download</span>
          </button>

          <div className="hidden sm:flex items-center space-x-2 ml-2">
            <input
              type="checkbox"
              id="autoCompile"
              checked={autoCompile}
              onChange={(e) => setAutoCompile(e.target.checked)}
              className="rounded text-blue-500 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
            />
            <label
              htmlFor="autoCompile"
              className="text-gray-300 text-xs cursor-pointer select-none"
            >
              Auto-compile
            </label>
          </div>
        </div>

        {/* Settings button */}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={toggleSettings}
            className="p-1.5 rounded-full hover:bg-gray-700 text-gray-300 focus:outline-none"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>

          {/* Settings dropdown */}
          {isSettingsOpen && (
            <div className="absolute right-0 mt-2 w-60 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50">
              <div className="py-1 border-b border-gray-700">
                <div className="px-4 py-2">
                  <p className="text-sm font-medium text-gray-300">Signed in as</p>
                  <p className="text-xs truncate text-gray-400">{userId}</p>
                </div>
              </div>
              
              <div className="py-1">
                <button
                  onClick={() => setViewMode("code")}
                  className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 flex items-center"
                >
                  <Edit className="h-4 w-4 mr-3" />
                  Code View
                </button>
                <button
                  onClick={() => setViewMode("split")}
                  className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 flex items-center"
                >
                  <Layout className="h-4 w-4 mr-3" />
                  Split View
                </button>
                <button
                  onClick={() => setViewMode("pdf")}
                  className="w-full px-4 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 flex items-center"
                >
                  <Eye className="h-4 w-4 mr-3" />
                  PDF View
                </button>
              </div>
              
              <div className="py-1 border-t border-gray-700">
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="text-sm text-gray-300">Auto-compile</span>
                  <label className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={autoCompile}
                      onChange={(e) => setAutoCompile(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-10 h-5 rounded-full transition-colors ${
                      autoCompile ? 'bg-blue-600' : 'bg-gray-600'
                    }`}>
                      <div className={`transform transition-transform h-4 w-4 rounded-full bg-white shadow-md ${
                        autoCompile ? 'translate-x-5' : 'translate-x-1'
                      }`} style={{ marginTop: '2px' }}></div>
                    </div>
                  </label>
                </div>
              </div>
              
              <div className="py-1 border-t border-gray-700">
                <Link
                  href="/dashboard"
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center"
                >
                  <ArrowLeft className="h-4 w-4 mr-3" />
                  Back to Dashboard
                </Link>
                <Link
                  href="/help"
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center"
                >
                  <HelpCircle className="h-4 w-4 mr-3" />
                  Help & Documentation
                </Link>
                <Link
                  href="/sign-out"
                  className="block px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center"
                >
                  <LogOut className="h-4 w-4 mr-3" />
                  Sign Out
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default EnhancedHeader;