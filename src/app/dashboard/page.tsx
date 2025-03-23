"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser, UserButton, ClerkLoading } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import FirebaseDebug from "@/components/FirebaseDebug";
import { XCircle, RefreshCw } from "lucide-react";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// Import new components
import NewProjectModal from "@/components/NewProjectModal";
import ProjectCard from "@/components/ProjectCard";
import ProjectSettingsModal from "@/components/ProjectSettingsModal";
import TagManager from "@/components/TagManager";
import { useProjects } from "../../hooks/useProjects";

// Icons
import {
  Plus,
  Search,
  File,
  FolderOpen,
  Share2,
  Archive,
  Trash2,
  SortDesc,
  Info,
  FileText,
  Download,
  Copy,
  MoreHorizontal,
  Grid,
  List,
  Tag,
  Filter,
  X,
  ChevronDown,
} from "lucide-react";

import "./dashboard.css";
import { clerkClient } from "@clerk/nextjs/server";

export default function DashboardPage() {
  const { user } = useUser();
  const userId = user?.id || null;
  const router = useRouter();
  const { projects, loading, error, refreshProjects, firebaseAuth, dataInitialized } = useProjects(userId);

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [viewMode, setViewMode] = useState("grid"); // "grid" or "list"
  const [sortBy, setSortBy] = useState("lastModified");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterTag, setFilterTag] = useState(null);
  const [currentSection, setCurrentSection] = useState("all");

  // Modals
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsProject, setSettingsProject] = useState(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [showTagsMenu, setShowTagsMenu] = useState(false);

  // Load user tags
  const [userTags, setUserTags] = useState([]);

  useEffect(() => {
    const fetchUserTags = async () => {
      if (!userId) return;
      try {
        const tagsRef = collection(db, "tags");
        const q = query(tagsRef, where("userId", "==", userId));
        const querySnapshot = await getDocs(q);

        const tags = [];
        querySnapshot.forEach((doc) => {
          tags.push({
            id: doc.id,
            ...doc.data()
          });
        });

        setUserTags(tags);
      } catch (error) {
        console.error("Error fetching tags:", error);
      }
    };

    fetchUserTags();
  }, [userId, tagManagerOpen]);

  // Filter and sort projects
  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSection =
      (currentSection === "all") ||
      (currentSection === "owned" && project.owner === userId) ||
      (currentSection === "shared" && project.collaborators?.includes(userId)) ||
      (currentSection === "archived" && project.archived) ||
      (currentSection === "trash" && project.trashed);
    const matchesTag = !filterTag || (project.tags && project.tags.includes(filterTag));

    return matchesSearch && matchesSection && matchesTag;
  });

  // Selection logic
  const toggleProjectSelection = (id) => {
    setSelectedProjects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const allSelected = filteredProjects.length > 0 && filteredProjects.length === selectedProjects.length;

  const toggleAllSelection = () => {
    if (allSelected) {
      setSelectedProjects([]);
    } else {
      setSelectedProjects(filteredProjects.map((p) => p.id));
    }
  };

  // Handle bulk actions
  const handleBulkDelete = async () => {
    if (!selectedProjects.length) return;

    const confirmed = window.confirm(`Are you sure you want to delete ${selectedProjects.length} project(s)?`);
    if (!confirmed) return;

    try {
      // Handle deletion logic
      for (const projectId of selectedProjects) {
        try {
          const projectRef = doc(db, "projects", projectId);

          // First try to update as trashed
          await updateDoc(projectRef, {
            trashed: true,
            trashedAt: serverTimestamp()
          });

          console.log(`Project ${projectId} marked as trashed successfully`);
        } catch (error) {
          console.error(`Error trashing project ${projectId}:`, error);
        }
      }

      // Refresh projects and clear selection
      setSelectedProjects([]);

      // Force refresh
      setTimeout(() => {
        refreshProjects();
      }, 500);

    } catch (error) {
      console.error("Error during bulk delete operation:", error);
      alert("There was a problem deleting some projects. Please try again.");
    }
  };

  // Open project settings
  const openProjectSettings = (project) => {
    setSettingsProject(project);
    setSettingsModalOpen(true);
  };

  // Tag color function
  const getTagColor = (tagName) => {
    const tag = userTags.find(t => t.name === tagName);
    return tag ? `bg-gray-100 text-gray-800` : "bg-gray-100 text-gray-800";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <div className="font-bold text-xl bg-gradient-to-r from-teal-500 to-blue-500 bg-clip-text text-transparent">
              LaTeX Scholar
            </div>
          </Link>
        </div>

        <div className="p-4">
          <button
            onClick={() => setNewProjectModalOpen(true)}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white py-2 px-4 rounded-md flex items-center justify-center transition-colors card-shadow"
          >
            <Plus className="h-4 w-4 mr-2" />
            <span>New Project</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            <li>
              <button
                className={`w-full text-left py-2 px-3 rounded-md flex items-center sidebar-tab ${currentSection === "all" ? "active" : ""
                  }`}
                onClick={() => setCurrentSection("all")}
              >
                <File className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">All Projects</span>
              </button>
            </li>
            <li>
              <button
                className={`w-full text-left py-2 px-3 rounded-md flex items-center sidebar-tab ${currentSection === "owned" ? "active" : ""
                  }`}
                onClick={() => setCurrentSection("owned")}
              >
                <FolderOpen className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Your Projects</span>
              </button>
            </li>
            <li>
              <button
                className={`w-full text-left py-2 px-3 rounded-md flex items-center sidebar-tab ${currentSection === "shared" ? "active" : ""
                  }`}
                onClick={() => setCurrentSection("shared")}
              >
                <Share2 className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Shared with you</span>
              </button>
            </li>
            <li>
              <button
                className={`w-full text-left py-2 px-3 rounded-md flex items-center sidebar-tab ${currentSection === "archived" ? "active" : ""
                  }`}
                onClick={() => setCurrentSection("archived")}
              >
                <Archive className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Archived Projects</span>
              </button>
            </li>
            <li>
              <button
                className={`w-full text-left py-2 px-3 rounded-md flex items-center sidebar-tab ${currentSection === "trash" ? "active" : ""
                  }`}
                onClick={() => setCurrentSection("trash")}
              >
                <Trash2 className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Trashed Projects</span>
              </button>
            </li>
          </ul>

          <div className="mt-8 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="sidebar-heading">
                Tags
              </h3>
              <button
                onClick={() => setTagManagerOpen(true)}
                className="text-xs text-teal-600 hover:text-teal-700"
              >
                Manage
              </button>
            </div>

            <div className="relative">
              <button
                className="px-3 py-1 w-full text-left flex items-center justify-between sidebar-tab rounded-md"
                onClick={() => setShowTagsMenu(!showTagsMenu)}
              >
                <div className="flex items-center">
                  <Tag className="h-3 w-3 mr-2 sidebar-icon" />
                  <span className="sidebar-text text-sm">Filter by tag</span>
                </div>
                <ChevronDown className="h-3 w-3 sidebar-icon" />
              </button>

              {/* Rest of the tags menu */}
            </div>
          </div>
        </nav>
      </aside>

      {/* Main content */}
      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-800">
            Dashboard
          </h1>

          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-gradient-to-r from-teal-50 to-blue-50 px-3 py-1.5 rounded-full text-sm text-teal-700 border border-teal-100 premium-badge">
              <span className="font-medium">Premium</span>
              <Info className="h-4 w-4 ml-1 text-teal-600" />
            </div>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Project list */}
        <div className="flex-1 overflow-auto bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-teal-500 focus:border-teal-500 block w-full pl-10 p-2.5"
                  placeholder="Search in your projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center space-x-3">
                {/* View mode toggle */}
                <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                  <button
                    className={`p-2 ${viewMode === 'grid' ? 'bg-gray-100 text-teal-600' : 'text-gray-600'}`}
                    onClick={() => setViewMode('grid')}
                    title="Grid view"
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    className={`p-2 ${viewMode === 'list' ? 'bg-gray-100 text-teal-600' : 'text-gray-600'}`}
                    onClick={() => setViewMode('list')}
                    title="List view"
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>

                {/* Sort dropdown */}
                <div className="relative">
                  <button
                    className="flex items-center border border-gray-300 rounded-md px-3 py-2 bg-white text-sm text-gray-700"
                    onClick={() => {
                      // Toggle sort order if clicking the same field, otherwise set new field
                      if (sortBy === "lastModified") {
                        setSortOrder(prev => prev === "desc" ? "asc" : "desc");
                      } else {
                        setSortBy("lastModified");
                        setSortOrder("desc");
                      }
                    }}
                  >
                    <SortDesc className="h-4 w-4 mr-1" />
                    <span>Last Modified</span>
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bulk actions bar */}
            {selectedProjects.length > 0 && (
              <div className="mb-4 p-2 bg-gray-50 border border-gray-200 rounded-md flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {selectedProjects.length} projects selected
                </div>
                <div className="flex space-x-2">
                  <button
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 flex items-center"
                    onClick={() => setSelectedProjects([])}
                  >
                    <X className="h-4 w-4 mr-1" />
                    <span>Cancel</span>
                  </button>
                  <button
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-700 flex items-center"
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )}

            {/* Projects grid/list view */}
            {(loading || !dataInitialized) ? (
              <div className="text-center py-12">
                <div className="flex flex-col items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500 mb-4"></div>
                  <p className="text-gray-500">Loading projects...</p>
                </div>
              </div>
            ) : error ? (
              <div className="text-center py-12 border border-red-200 rounded-lg bg-red-50">
                <div className="text-red-500 mb-3">
                  <XCircle className="h-12 w-12 mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-red-800 mb-1">Error loading projects</h3>
                <p className="text-red-600 mb-4">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 inline-flex items-center"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  <span>Retry</span>
                </button>
              </div>
            ) : filteredProjects.length > 0 ? (
              viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onSelect={() => toggleProjectSelection(project.id)}
                      isSelected={selectedProjects.includes(project.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white overflow-hidden shadow-sm sm:rounded-lg border border-gray-200 card-shadow">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded custom-checkbox"
                            checked={allSelected}
                            onChange={toggleAllSelection}
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Title
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tags
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <button
                            className="flex items-center focus:outline-none"
                            onClick={() => {
                              setSortBy("lastModified");
                              setSortOrder(prev => prev === "desc" ? "asc" : "desc");
                            }}
                          >
                            Last Modified
                            <SortDesc className={`h-4 w-4 ml-1 ${sortOrder === "asc" ? "transform rotate-180" : ""}`} />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredProjects.map((project) => (
                        <tr
                          key={project.id}
                          className="project-row hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded custom-checkbox"
                              checked={selectedProjects.includes(project.id)}
                              onChange={() => toggleProjectSelection(project.id)}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <div className="flex items-center">
                                <File className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                                <Link href={`/editor/${project.id}`} className="text-gray-900 hover:text-teal-600 font-medium">
                                  {project.title}
                                </Link>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {project.tags && project.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {project.tags.map((tag, i) => (
                                  <span
                                    key={i}
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium tag-badge ${getTagColor(tag)}`}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">No tags</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {project.lastModified?.seconds
                              ? new Date(project.lastModified.seconds * 1000).toLocaleDateString()
                              : ""}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end space-x-2">
                              <button
                                className="text-gray-400 hover:text-gray-500 action-button"
                                title="Settings"
                                onClick={() => openProjectSettings(project)}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                              <button className="text-gray-400 hover:text-gray-500 action-button" title="Download">
                                <Download className="h-4 w-4" />
                              </button>
                              <button className="text-gray-400 hover:text-gray-500 action-button" title="Share">
                                <Share2 className="h-4 w-4" />
                              </button>
                              <button className="text-gray-400 hover:text-gray-500 action-button" title="Copy">
                                <Copy className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="text-center py-12 border border-gray-200 rounded-lg bg-gray-50">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-800 mb-1">No projects found</h3>
                <p className="text-gray-500 mb-4">
                  {searchQuery
                    ? "No projects match your search criteria"
                    : filterTag
                      ? `No projects with the tag "${filterTag}"`
                      : "Get started by creating a new project"}
                </p>
                <button
                  onClick={() => setNewProjectModalOpen(true)}
                  className="bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700 inline-flex items-center"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span>Create New Project</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <NewProjectModal
        isOpen={newProjectModalOpen}
        onClose={() => setNewProjectModalOpen(false)}
        userId={userId}
      />

      <ProjectSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => {
          setSettingsModalOpen(false);
          refreshProjects();
        }}
        project={settingsProject}
        userId={userId}
      />

      <TagManager
        isOpen={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        userId={userId}
      />
    </div>
  );
}