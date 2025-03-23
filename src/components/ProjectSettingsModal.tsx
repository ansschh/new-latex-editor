"use client";

import { useState, useEffect } from "react";
import { X, Plus, Tag, User, Globe, Lock, Trash2 } from "lucide-react";
import { doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function ProjectSettingsModal({ isOpen, onClose, project, userId }) {
  const router = useRouter();
  const [title, setTitle] = useState(project?.title || "");
  const [newTag, setNewTag] = useState("");
  const [tags, setTags] = useState(project?.tags || []);
  const [isPublic, setIsPublic] = useState(project?.isPublic || false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("general");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (project) {
      setTitle(project.title || "");
      setTags(project.tags || []);
      setIsPublic(project.isPublic || false);
    }
  }, [project]);

  const handleSave = async () => {
    if (!project?.id || !userId) return;
    if (!title.trim()) {
      setError("Project title cannot be empty");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const projectRef = doc(db, "projects", project.id);
      await updateDoc(projectRef, {
        title,
        tags,
        isPublic,
        lastModified: serverTimestamp(),
      });
      
      onClose();
    } catch (error) {
      console.error("Error updating project:", error);
      setError("Failed to update project. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() !== "" && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleDeleteProject = async () => {
    if (!confirmDelete || !project?.id || !userId) return;
    
    setLoading(true);
    
    try {
      const projectRef = doc(db, "projects", project.id);
      await deleteDoc(projectRef);
      
      router.push("/dashboard");
      onClose();
    } catch (error) {
      console.error("Error deleting project:", error);
      setError("Failed to delete project. Please try again.");
    } finally {
      setLoading(false);
      setConfirmDelete(false);
    }
  };

  if (!isOpen || !project) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-xl p-0 shadow-xl">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Project Settings</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-gray-200">
          <button
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "general" 
                ? "text-teal-600 border-b-2 border-teal-600" 
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("general")}
          >
            General
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "sharing" 
                ? "text-teal-600 border-b-2 border-teal-600" 
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("sharing")}
          >
            Sharing
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "danger" 
                ? "text-red-600 border-b-2 border-red-600" 
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("danger")}
          >
            Danger Zone
          </button>
        </div>

        <div className="p-6">
          {activeTab === "general" && (
            <>
              <div className="mb-4">
                <label htmlFor="projectTitle" className="block text-sm font-medium text-gray-700 mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  id="projectTitle"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Enter project title"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((tag, index) => (
                    <div 
                      key={index} 
                      className="bg-gray-100 text-gray-800 text-xs rounded px-2 py-1 flex items-center"
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      <span>{tag}</span>
                      <button 
                        onClick={() => handleRemoveTag(tag)} 
                        className="ml-1 text-gray-500 hover:text-gray-700"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Add a tag"
                  />
                  <button
                    onClick={handleAddTag}
                    className="bg-gray-100 px-3 py-2 border border-gray-300 border-l-0 rounded-r-md hover:bg-gray-200"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === "sharing" && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Visibility
                </label>
                <div className="space-y-2">
                  <div 
                    className={`border rounded-md p-3 cursor-pointer transition-colors ${
                      !isPublic ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setIsPublic(false)}
                  >
                    <div className="flex items-center">
                      <Lock className="h-5 w-5 mr-2 text-gray-600" />
                      <div>
                        <div className="font-medium">Private</div>
                        <div className="text-xs text-gray-500 mt-1">Only you and collaborators can access</div>
                      </div>
                    </div>
                  </div>
                  
                  <div 
                    className={`border rounded-md p-3 cursor-pointer transition-colors ${
                      isPublic ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setIsPublic(true)}
                  >
                    <div className="flex items-center">
                      <Globe className="h-5 w-5 mr-2 text-gray-600" />
                      <div>
                        <div className="font-medium">Public</div>
                        <div className="text-xs text-gray-500 mt-1">Anyone with the link can view</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Collaborators
                </label>
                <div className="border border-gray-200 rounded-md p-4 bg-gray-50 text-center">
                  <User className="h-5 w-5 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500">Collaborator management is available on Premium plan</p>
                  <button className="mt-2 text-xs font-medium text-teal-600">Upgrade to Premium</button>
                </div>
              </div>
            </>
          )}

          {activeTab === "danger" && (
            <div className="border border-red-200 rounded-md p-4 bg-red-50">
              <div className="flex items-start">
                <Trash2 className="h-5 w-5 text-red-500 mr-3 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Delete Project</h3>
                  <p className="text-xs text-red-700 mt-1">
                    Once you delete this project, there is no going back. Please be certain.
                  </p>
                  
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="mt-3 bg-white border border-red-300 text-red-600 hover:bg-red-50 text-xs px-3 py-1.5 rounded"
                    >
                      Delete this project
                    </button>
                  ) : (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-red-800 mb-2">
                        Are you absolutely sure?
                      </p>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs px-3 py-1.5 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteProject}
                          className="bg-red-600 text-white hover:bg-red-700 text-xs px-3 py-1.5 rounded"
                          disabled={loading}
                        >
                          {loading ? "Deleting..." : "Yes, delete it"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className={`px-4 py-2 text-sm bg-teal-600 text-white rounded-md ${
              loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-teal-700'
            }`}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}