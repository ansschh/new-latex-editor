// hooks/useProjectFiles.ts
"use client";

import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  getDoc,
  getDocs
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authenticateWithFirebase } from "@/lib/firebase-auth";

export interface FileItem {
  id: string;
  name: string;
  type: "file" | "folder";
  projectId: string;
  parentId: string | null;
  content?: string;
  createdAt: any;
  lastModified: any;
  ownerId: string;
}

interface UseProjectFilesProps {
  projectId: string;
  userId: string;
}

interface UseProjectFilesReturn {
  files: FileItem[];
  loading: boolean;
  error: string | null;
  createFile: (name: string, parentId: string | null, content?: string) => Promise<string>;
  createFolder: (name: string, parentId: string | null) => Promise<string>;
  renameFile: (fileId: string, newName: string) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
  updateFileContent: (fileId: string, content: string) => Promise<void>;
  getFileContent: (fileId: string) => Promise<string>;
  getFileStructure: () => FileItem[];
  moveFile: (fileId: string, newParentId: string | null) => Promise<void>;
}

export const useProjectFiles = ({ projectId, userId }: UseProjectFilesProps): UseProjectFilesReturn => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to file changes for this project
  useEffect(() => {
    if (!projectId || !userId) {
      setLoading(false);
      return;
    }

    const fetchFiles = async () => {
      try {
        // Authenticate with Firebase first
        await authenticateWithFirebase(userId);

        // Create a query for project files
        const filesRef = collection(db, "project_files");
        const q = query(
          filesRef,
          where("projectId", "==", projectId),
          orderBy("createdAt", "asc")
        );

        // Subscribe to changes
        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const filesData: FileItem[] = [];
            snapshot.forEach((doc) => {
              filesData.push({
                id: doc.id,
                ...doc.data()
              } as FileItem);
            });

            setFiles(filesData);
            setLoading(false);
          },
          (err) => {
            console.error("Error in files listener:", err);
            setError(err.message);
            setLoading(false);
          }
        );

        // Return unsubscribe function
        return unsubscribe;
      } catch (err: any) {
        console.error("Error setting up files subscription:", err);
        setError(err.message);
        setLoading(false);
        return () => {};
      }
    };

    fetchFiles();
  }, [projectId, userId]);

  // Initialize project structure if it doesn't exist
  useEffect(() => {
    const initializeProjectStructure = async () => {
      if (!projectId || !userId || loading || error || files.length > 0) return;

      try {
        // Check if the project exists
        const projectRef = doc(db, "projects", projectId);
        const projectDoc = await getDoc(projectRef);

        if (!projectDoc.exists()) {
          throw new Error("Project not found");
        }

        // If no files exist for this project, create default structure
        const batch = writeBatch(db);
        const filesCollectionRef = collection(db, "project_files");

        // Create main.tex file
        const mainFileRef = await addDoc(filesCollectionRef, {
          name: "main.tex",
          type: "file",
          projectId,
          parentId: null,
          ownerId: userId,
          content: projectDoc.data().content || "% Start your LaTeX document here",
          createdAt: serverTimestamp(),
          lastModified: serverTimestamp(),
        });

        // Create references.bib file
        await addDoc(filesCollectionRef, {
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
        const figuresFolderRef = await addDoc(filesCollectionRef, {
          name: "figures",
          type: "folder",
          projectId,
          parentId: null,
          ownerId: userId,
          createdAt: serverTimestamp(),
          lastModified: serverTimestamp(),
        });

        // Create sections folder
        const sectionsFolderRef = await addDoc(filesCollectionRef, {
          name: "sections",
          type: "folder",
          projectId,
          parentId: null,
          ownerId: userId,
          createdAt: serverTimestamp(),
          lastModified: serverTimestamp(),
        });

        // Create introduction.tex in sections
        await addDoc(filesCollectionRef, {
          name: "introduction.tex",
          type: "file",
          projectId,
          parentId: sectionsFolderRef.id,
          ownerId: userId,
          content: "% Introduction section\n\\section{Introduction}\nThis is the introduction of my document.",
          createdAt: serverTimestamp(),
          lastModified: serverTimestamp(),
        });

        console.log("Created default project structure");
      } catch (err: any) {
        console.error("Error initializing project structure:", err);
        setError(err.message);
      }
    };

    initializeProjectStructure();
  }, [projectId, userId, files.length, loading, error]);

  // Create a new file
  const createFile = async (name: string, parentId: string | null, content: string = ""): Promise<string> => {
    try {
      // Create file in Firestore
      const docRef = await addDoc(collection(db, "project_files"), {
        name,
        type: "file",
        projectId,
        parentId,
        ownerId: userId,
        content,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      });

      return docRef.id;
    } catch (err: any) {
      console.error("Error creating file:", err);
      setError(err.message);
      throw err;
    }
  };

  // Create a new folder
  const createFolder = async (name: string, parentId: string | null): Promise<string> => {
    try {
      // Create folder in Firestore
      const docRef = await addDoc(collection(db, "project_files"), {
        name,
        type: "folder",
        projectId,
        parentId,
        ownerId: userId,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      });

      return docRef.id;
    } catch (err: any) {
      console.error("Error creating folder:", err);
      setError(err.message);
      throw err;
    }
  };

  // Rename a file or folder
  const renameFile = async (fileId: string, newName: string): Promise<void> => {
    try {
      // Update the file in Firestore
      const fileRef = doc(db, "project_files", fileId);
      await updateDoc(fileRef, {
        name: newName,
        lastModified: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("Error renaming file:", err);
      setError(err.message);
      throw err;
    }
  };

  // Delete a file or folder and all its children
  const deleteFile = async (fileId: string): Promise<void> => {
    try {
      // Find the file
      const fileToDelete = files.find(file => file.id === fileId);
      if (!fileToDelete) {
        throw new Error("File not found");
      }

      // If it's a folder, recursively delete all children
      if (fileToDelete.type === "folder") {
        // Function to get all descendant IDs
        const getAllDescendantIds = (parentId: string): string[] => {
          const directChildren = files.filter(file => file.parentId === parentId);
          let allDescendants: string[] = directChildren.map(child => child.id);

          // For each child that's a folder, get its descendants
          directChildren
            .filter(child => child.type === "folder")
            .forEach(folder => {
              allDescendants = [...allDescendants, ...getAllDescendantIds(folder.id)];
            });

          return allDescendants;
        };

        // Get all descendant IDs
        const descendantIds = getAllDescendantIds(fileId);

        // Delete all descendants in batch
        const batch = writeBatch(db);
        descendantIds.forEach(id => {
          const descRef = doc(db, "project_files", id);
          batch.delete(descRef);
        });

        // Commit the batch
        await batch.commit();
      }

      // Delete the file itself
      const fileRef = doc(db, "project_files", fileId);
      await deleteDoc(fileRef);
    } catch (err: any) {
      console.error("Error deleting file:", err);
      setError(err.message);
      throw err;
    }
  };

  // Update file content
  const updateFileContent = async (fileId: string, content: string): Promise<void> => {
    try {
      // Update the file in Firestore
      const fileRef = doc(db, "project_files", fileId);
      await updateDoc(fileRef, {
        content,
        lastModified: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("Error updating file content:", err);
      setError(err.message);
      throw err;
    }
  };

  // Get file content
  const getFileContent = async (fileId: string): Promise<string> => {
    try {
      // Get file from Firestore
      const fileRef = doc(db, "project_files", fileId);
      const fileDoc = await getDoc(fileRef);

      if (!fileDoc.exists()) {
        throw new Error("File not found");
      }

      return fileDoc.data().content || "";
    } catch (err: any) {
      console.error("Error getting file content:", err);
      setError(err.message);
      throw err;
    }
  };

  // Get hierarchical file structure
  const getFileStructure = (): FileItem[] => {
    // Build file tree
    const buildFileTree = (items: FileItem[], parentId: string | null = null): FileItem[] => {
      return items
        .filter(item => item.parentId === parentId)
        .sort((a, b) => {
          // Sort folders before files
          if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
          }
          // Alphabetical sort by name
          return a.name.localeCompare(b.name);
        });
    };

    return buildFileTree(files);
  };

  // Move a file to a new parent
  const moveFile = async (fileId: string, newParentId: string | null): Promise<void> => {
    try {
      // Check that the destination folder exists, if it's not null
      if (newParentId !== null) {
        const destinationFolderRef = doc(db, "project_files", newParentId);
        const destinationFolderDoc = await getDoc(destinationFolderRef);

        if (!destinationFolderDoc.exists() || destinationFolderDoc.data().type !== "folder") {
          throw new Error("Destination folder not found");
        }
      }

      // Check that we're not creating a circular reference
      if (newParentId !== null) {
        // Function to get all parent IDs
        const getAllParentIds = (folderId: string): Promise<string[]> => {
          return new Promise(async (resolve, reject) => {
            try {
              const folderRef = doc(db, "project_files", folderId);
              const folderDoc = await getDoc(folderRef);

              if (!folderDoc.exists()) {
                resolve([]);
                return;
              }

              const parentId = folderDoc.data().parentId;
              if (!parentId) {
                resolve([]);
                return;
              }

              const parentIds = await getAllParentIds(parentId);
              resolve([parentId, ...parentIds]);
            } catch (err) {
              reject(err);
            }
          });
        };

        const parentIds = await getAllParentIds(newParentId);
        if (parentIds.includes(fileId)) {
          throw new Error("Cannot move a folder inside itself or its children");
        }
      }

      // Update the file's parent
      const fileRef = doc(db, "project_files", fileId);
      await updateDoc(fileRef, {
        parentId: newParentId,
        lastModified: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("Error moving file:", err);
      setError(err.message);
      throw err;
    }
  };

  return {
    files,
    loading,
    error,
    createFile,
    createFolder,
    renameFile,
    deleteFile,
    updateFileContent,
    getFileContent,
    getFileStructure,
    moveFile,
  };
};

export default useProjectFiles;