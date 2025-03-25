// components/EditableProjectName.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface EditableProjectNameProps {
  projectId: string;
  initialTitle: string;
  showUnsavedIndicator?: boolean;
  onTitleChange?: (newTitle: string) => void;
}

const EditableProjectName: React.FC<EditableProjectNameProps> = ({
  projectId,
  initialTitle,
  showUnsavedIndicator = false,
  onTitleChange
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle || 'Untitled Project');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update title when initialTitle prop changes
  useEffect(() => {
    if (initialTitle) {
      setTitle(initialTitle);
    }
  }, [initialTitle]);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setTitle(initialTitle || 'Untitled Project');
    setIsEditing(false);
  };

  const saveTitle = async () => {
    if (!title.trim() || !projectId) {
      cancelEditing();
      return;
    }

    try {
      setIsSaving(true);
      
      // Update the project title in Firestore
      const projectRef = doc(db, "projects", projectId);
      await updateDoc(projectRef, {
        title: title.trim(),
        lastModified: serverTimestamp()
      });
      
      // Notify parent component
      if (onTitleChange) {
        onTitleChange(title.trim());
      }
      
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating project title:", error);
      // Revert to original title on error
      setTitle(initialTitle || 'Untitled Project');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  return (
    <div className="flex items-center">
      {isEditing ? (
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            saveTitle();
          }}
          className="flex items-center"
        >
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
            placeholder="Project Name"
          />
          <button
            type="submit"
            disabled={isSaving}
            className="ml-2 p-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={isSaving}
            className="ml-1 p-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <div className="flex items-center">
          <h1 className="font-medium text-gray-200 text-lg truncate max-w-xs">
            {title}
            {showUnsavedIndicator && <span className="ml-2 text-yellow-500 text-lg">•</span>}
          </h1>
          <button
            onClick={startEditing}
            className="ml-2 p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-700"
            title="Edit Project Name"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default EditableProjectName;