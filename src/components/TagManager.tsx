"use client";

import { useState, useEffect } from "react";
import { X, Plus, Tag, Edit2, Trash2 } from "lucide-react";
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

export default function TagManager({ isOpen, onClose, userId }) {
  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#10B981"); // Default to teal
  const [editingTag, setEditingTag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const colorOptions = [
    { name: "Teal", value: "#10B981" },
    { name: "Blue", value: "#3B82F6" },
    { name: "Red", value: "#EF4444" },
    { name: "Purple", value: "#8B5CF6" },
    { name: "Yellow", value: "#F59E0B" },
    { name: "Green", value: "#22C55E" },
    { name: "Pink", value: "#EC4899" },
    { name: "Gray", value: "#6B7280" },
  ];

  useEffect(() => {
    if (isOpen && userId) {
      fetchTags();
    }
  }, [isOpen, userId]);

  const fetchTags = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      const tagsRef = collection(db, "tags");
      const q = query(tagsRef, where("userId", "==", userId));
      const querySnapshot = await getDocs(q);
      
      const fetchedTags = [];
      querySnapshot.forEach((doc) => {
        fetchedTags.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      setTags(fetchedTags);
    } catch (error) {
      console.error("Error fetching tags:", error);
      setError("Failed to load tags. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = async () => {
    if (!userId || !newTagName.trim()) return;
    
    setLoading(true);
    setError("");

    try {
      // Check if tag with same name already exists
      const exists = tags.some(tag => tag.name.toLowerCase() === newTagName.trim().toLowerCase());
      
      if (exists) {
        setError("A tag with this name already exists");
        setLoading(false);
        return;
      }
      
      // Add new tag to Firestore
      await addDoc(collection(db, "tags"), {
        name: newTagName.trim(),
        color: newTagColor,
        userId: userId,
        createdAt: serverTimestamp()
      });
      
      // Refresh tags
      await fetchTags();
      
      // Reset form
      setNewTagName("");
    } catch (error) {
      console.error("Error adding tag:", error);
      setError("Failed to add tag. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !editingTag.name.trim() || !userId) return;
    
    setLoading(true);
    setError("");

    try {
      // Check if another tag with same name already exists
      const exists = tags.some(
        tag => tag.id !== editingTag.id && 
        tag.name.toLowerCase() === editingTag.name.trim().toLowerCase()
      );
      
      if (exists) {
        setError("Another tag with this name already exists");
        setLoading(false);
        return;
      }
      
      // Update tag in Firestore
      const tagRef = doc(db, "tags", editingTag.id);
      await updateDoc(tagRef, {
        name: editingTag.name.trim(),
        color: editingTag.color,
        updatedAt: serverTimestamp()
      });
      
      // Refresh tags
      await fetchTags();
      
      // Reset editing state
      setEditingTag(null);
    } catch (error) {
      console.error("Error updating tag:", error);
      setError("Failed to update tag. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (tagId) => {
    if (!tagId || !userId) return;
    
    setLoading(true);
    setError("");

    try {
      // Delete tag from Firestore
      const tagRef = doc(db, "tags", tagId);
      await deleteDoc(tagRef);
      
      // Refresh tags
      await fetchTags();
      
      // Reset editing state if deleting the tag being edited
      if (editingTag && editingTag.id === tagId) {
        setEditingTag(null);
      }
    } catch (error) {
      console.error("Error deleting tag:", error);
      setError("Failed to delete tag. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (tag) => {
    setEditingTag({ ...tag });
  };

  const cancelEditing = () => {
    setEditingTag(null);
    setError("");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Manage Tags</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Add new tag form */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Add New Tag</h3>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Tag name"
              />
            </div>
            <div>
              <select
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                style={{ backgroundColor: newTagColor, color: "white" }}
              >
                {colorOptions.map(color => (
                  <option 
                    key={color.value} 
                    value={color.value}
                    style={{ backgroundColor: color.value, color: "white" }}
                  >
                    {color.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAddTag}
              disabled={loading || !newTagName.trim()}
              className="bg-teal-600 text-white rounded-md px-3 py-2 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tags list */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Your Tags</h3>
          
          {loading && tags.length === 0 ? (
            <div className="text-center py-4 text-gray-500">Loading tags...</div>
          ) : tags.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No tags created yet</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {tags.map(tag => (
                <div key={tag.id} className="border border-gray-200 rounded-md p-3">
                  {editingTag && editingTag.id === tag.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingTag.name}
                        onChange={(e) => setEditingTag({...editingTag, name: e.target.value})}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <select
                        value={editingTag.color}
                        onChange={(e) => setEditingTag({...editingTag, color: e.target.value})}
                        className="px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500"
                        style={{ backgroundColor: editingTag.color, color: "white" }}
                      >
                        {colorOptions.map(color => (
                          <option 
                            key={color.value} 
                            value={color.value}
                            style={{ backgroundColor: color.value, color: "white" }}
                          >
                            {color.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleUpdateTag}
                        disabled={loading || !editingTag.name.trim()}
                        className="text-teal-600 hover:text-teal-700 disabled:text-gray-400"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span 
                          className="h-4 w-4 rounded-full mr-2" 
                          style={{ backgroundColor: tag.color }}
                        ></span>
                        <span className="text-gray-800">{tag.name}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => startEditing(tag)}
                          className="text-gray-500 hover:text-teal-600"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTag(tag.id)}
                          className="text-gray-500 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}