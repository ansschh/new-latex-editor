// components/EnhancedHeaderWithChat.tsx
import React from 'react';
import {
  ArrowLeft,
  Menu,
  Save,
  Download,
  Play,
  Loader,
  Edit,
  Eye,
  Layout,
  Settings
} from "lucide-react";
import HeaderChatButton from './HeaderChatButton';

// This component extends the functionality of EnhancedHeader by adding the chat button
// You can also modify the original EnhancedHeader.tsx file directly if preferred

interface EnhancedHeaderWithChatProps {
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

const EnhancedHeaderWithChat: React.FC<EnhancedHeaderWithChatProps> = ({
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
  return (
    <header className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center">
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
            onClick={() => window.location.href = "/dashboard"}
            className="mr-1 hover:text-gray-300"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="mr-4 flex items-center">
          <h1 className="font-medium text-gray-200 mr-1.5">{projectName}</h1>
          {activeFileName && (
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
        {/* Chat button */}
        <HeaderChatButton />

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
            className={`flex items-center px-3 py-1.5 rounded-md ${
              isSaved ? "bg-gray-600 text-gray-400" : "bg-blue-600 hover:bg-blue-700 text-white"
            } text-sm transition-colors`}
            title="Save (Ctrl+S)"
            disabled={isSaved}
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
        <button
          className="p-1.5 rounded-full hover:bg-gray-700 text-gray-300 focus:outline-none"
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
};

export default EnhancedHeaderWithChat;