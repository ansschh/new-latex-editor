// Enhanced FixedFileUploader.tsx with better Firebase Storage handling
import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Check, AlertCircle, FileText, Image, File, Loader } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, UploadTask } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { getAuth } from 'firebase/auth';

interface FileUploaderProps {
  projectId: string;
  userId: string;
  parentId?: string | null;
  onUploadComplete: () => void;
  className?: string;
}

const FixedFileUploader: React.FC<FileUploaderProps> = ({
  projectId,
  userId,
  parentId = null,
  onUploadComplete,
  className = ''
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessCount, setUploadSuccessCount] = useState<number>(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTasksRef = useRef<{[key: string]: UploadTask}>({});
  const auth = getAuth();

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setSelectedFiles(Array.from(files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          resolve(event.target.result as string);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          resolve(event.target.result as string);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Helper function to determine if a file is a text file
  const isTextFile = (file: File): boolean => {
    return (
      file.type === 'text/plain' || 
      file.name.endsWith('.tex') || 
      file.name.endsWith('.bib') || 
      file.name.endsWith('.cls') || 
      file.name.endsWith('.sty')
    );
  };

  // Helper function to get file icon based on file type
  const getFileIcon = (file: File) => {
    if (isTextFile(file)) {
      return <FileText className="h-4 w-4 text-amber-400" />;
    } else if (file.type.startsWith('image/')) {
      return <Image className="h-4 w-4 text-blue-400" />;
    } else {
      return <File className="h-4 w-4 text-gray-400" />;
    }
  };

  // Enhanced upload function for Firebase Storage
  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return;
    
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress({});
    setUploadSuccessCount(0);
    
    try {
      let successCount = 0;
      
      // Upload each file in sequence
      for (const file of selectedFiles) {
        // Initialize progress for this file
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
        
        try {
          console.log(`Starting upload for file: ${file.name}`);
          
          if (isTextFile(file)) {
            // For text files
            setUploadProgress(prev => ({ ...prev, [file.name]: 30 }));
            const content = await readFileAsText(file);
            
            setUploadProgress(prev => ({ ...prev, [file.name]: 60 }));
            
            // Create a unique filename to avoid collisions
            const timestamp = Date.now();
            const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const uniqueFileName = `${timestamp}_${safeFileName}`;
            
            // Add file directly to Firestore
            await addDoc(collection(db, "projectFiles"), {
              _name_: file.name,
              type: 'file',
              fileType: 'text',
              size: file.size,
              content: content,
              projectId: projectId,
              parentId: parentId,
              ownerId: userId,
              createdAt: serverTimestamp(),
              lastModified: serverTimestamp()
            });
            
            console.log(`Added text file to Firestore: ${file.name}`);
            setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
            successCount++;
          } 
          else if (file.type.startsWith('image/') && file.size < 1000000) {
            // For small images (< 1MB), convert to data URL and store directly in Firestore
            setUploadProgress(prev => ({ ...prev, [file.name]: 30 }));
            
            const dataUrl = await readFileAsDataURL(file);
            setUploadProgress(prev => ({ ...prev, [file.name]: 60 }));
            
            // Add the image data directly to Firestore
            await addDoc(collection(db, "projectFiles"), {
              _name_: file.name,
              type: 'file',
              fileType: 'image',
              size: file.size,
              content: dataUrl, // Store the data URL directly in Firestore
              projectId: projectId,
              parentId: parentId,
              ownerId: userId,
              createdAt: serverTimestamp(),
              lastModified: serverTimestamp()
            });
            
            console.log(`Added image as data URL to Firestore: ${file.name}`);
            setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
            successCount++;
          }
          else {
            // For larger images and other binary files, use Firebase Storage with progress tracking
            setUploadProgress(prev => ({ ...prev, [file.name]: 10 }));
            
            try {
              // Create a unique filename to avoid collisions
              const timestamp = Date.now();
              const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
              const uniqueFileName = `${timestamp}_${safeFileName}`;
              
              // Reference to the file location in Firebase Storage
              const storageRef = ref(storage, `projects/${projectId}/files/${uniqueFileName}`);
              
              // Create and start the upload task with progress monitoring
              const uploadTask = uploadBytes(storageRef, file);
              uploadTasksRef.current[file.name] = uploadTask as any;
              
              // Upload the file and wait for completion
              setUploadProgress(prev => ({ ...prev, [file.name]: 30 }));
              const snapshot = await uploadTask;
              
              setUploadProgress(prev => ({ ...prev, [file.name]: 80 }));
              
              // Get the download URL
              const downloadURL = await getDownloadURL(snapshot.ref);
              
              // Add file metadata to Firestore
              await addDoc(collection(db, "projectFiles"), {
                _name_: file.name,
                type: 'file',
                fileType: file.type.startsWith('image/') ? 'image' : 'binary',
                size: file.size,
                projectId: projectId,
                parentId: parentId,
                ownerId: userId,
                downloadURL: downloadURL,
                createdAt: serverTimestamp(),
                lastModified: serverTimestamp()
              });
              
              console.log(`Uploaded file to Storage and added metadata: ${file.name}`);
              setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
              successCount++;
            } catch (storageError: any) {
              console.error(`Error uploading to Firebase Storage: ${file.name}`, storageError);
              
              // If it's a small binary file, try to store directly in Firestore as fallback
              if (file.size < 500000) { // Less than 500KB
                console.log(`Trying to store small binary file directly in Firestore: ${file.name}`);
                try {
                  const dataUrl = await readFileAsDataURL(file);
                  await addDoc(collection(db, "projectFiles"), {
                    _name_: file.name,
                    type: 'file',
                    fileType: 'binary',
                    size: file.size,
                    content: dataUrl,
                    projectId: projectId,
                    parentId: parentId,
                    ownerId: userId,
                    createdAt: serverTimestamp(),
                    lastModified: serverTimestamp()
                  });
                  console.log(`Added small binary file as data URL to Firestore: ${file.name}`);
                  setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
                  successCount++;
                } catch (firestoreError) {
                  console.error(`Error adding to Firestore: ${file.name}`, firestoreError);
                  setUploadProgress(prev => ({ ...prev, [file.name]: -1 }));
                  throw firestoreError;
                }
              } else {
                setUploadProgress(prev => ({ ...prev, [file.name]: -1 }));
                throw storageError;
              }
            }
          }
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          setUploadProgress(prev => ({ ...prev, [file.name]: -1 })); // -1 indicates error
        }
      }
      
      setUploadSuccessCount(successCount);
      
      // If all files were uploaded successfully, call the callback
      if (successCount === selectedFiles.length) {
        onUploadComplete();
        
        // Clear selected files after a short delay
        setTimeout(() => {
          setSelectedFiles([]);
        }, 2000);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError(error instanceof Error ? error.message : "Failed to upload files");
    } finally {
      setIsUploading(false);
    }
  };

  const clearSelectedFiles = () => {
    // Cancel any ongoing uploads
    Object.entries(uploadTasksRef.current).forEach(([fileName, task]) => {
      if (task && typeof task.cancel === 'function') {
        try {
          task.cancel();
          console.log(`Cancelled upload for: ${fileName}`);
        } catch (e) {
          console.error(`Error cancelling upload for ${fileName}:`, e);
        }
      }
    });
    
    // Clear state
    uploadTasksRef.current = {};
    setSelectedFiles([]);
    setUploadProgress({});
    setUploadError(null);
    setUploadSuccessCount(0);
    
    // Also clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const cancelFileSelection = (fileToRemove: File) => {
    // Cancel upload for this file if it's in progress
    if (uploadTasksRef.current[fileToRemove.name] && 
        typeof uploadTasksRef.current[fileToRemove.name].cancel === 'function') {
      try {
        uploadTasksRef.current[fileToRemove.name].cancel();
        delete uploadTasksRef.current[fileToRemove.name];
      } catch (e) {
        console.error(`Error cancelling upload for ${fileToRemove.name}:`, e);
      }
    }
    
    // Remove from selected files
    setSelectedFiles(prevFiles => prevFiles.filter(file => file !== fileToRemove));
    
    // Remove from progress tracking
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileToRemove.name];
      return newProgress;
    });
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Hidden file input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />
      
      {/* Drag and drop area */}
      <div
        className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
          isDragging 
            ? 'border-blue-500 bg-blue-50/10' 
            : 'border-gray-600 hover:border-blue-400 bg-gray-800/30'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto text-gray-400 mb-3" />
        <p className="text-sm font-medium text-gray-300 mb-1">
          {isUploading ? 'Uploading...' : 'Drop files here or click to upload'}
        </p>
        <p className="text-xs text-gray-500">
          Supported formats: .tex, .bib, .cls, .sty, images, and more
        </p>
      </div>
      
      {/* Selected files */}
      {selectedFiles.length > 0 && !isUploading && (
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-gray-300">
              {selectedFiles.length} files selected
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={clearSelectedFiles}
                className="text-xs text-gray-400 hover:text-gray-200 flex items-center"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </button>
              <button
                onClick={uploadFiles}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded flex items-center"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Upload All
              </button>
            </div>
          </div>
          
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {selectedFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="bg-gray-800 rounded p-2 flex items-center text-xs">
                {getFileIcon(file)}
                <span className="ml-2 font-medium truncate flex-1 text-gray-300">{file.name}</span>
                <span className="text-gray-500 mx-2">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
                <button
                  onClick={() => cancelFileSelection(file)}
                  className="p-1 text-gray-400 hover:text-gray-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Upload progress */}
      {isUploading && Object.keys(uploadProgress).length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-sm font-medium text-gray-300">Uploading files...</h3>
            <span className="text-xs text-gray-400">
              {Object.values(uploadProgress).filter(p => p === 100).length} / {selectedFiles.length} complete
            </span>
          </div>
          
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {selectedFiles.map((file, index) => {
              const progress = uploadProgress[file.name] || 0;
              const isError = progress === -1;
              
              return (
                <div key={`${file.name}-${index}`} className="bg-gray-800 rounded p-2">
                  <div className="flex items-center text-xs mb-1">
                    {getFileIcon(file)}
                    <span className="ml-2 font-medium truncate flex-1 text-gray-300">{file.name}</span>
                    <span className="text-gray-400">
                      {isError ? (
                        <span className="text-red-400 flex items-center">
                          <AlertCircle className="h-3.5 w-3.5 mr-1" />
                          Error
                        </span>
                      ) : progress === 100 ? (
                        <span className="text-green-400 flex items-center">
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Complete
                        </span>
                      ) : (
                        `${progress}%`
                      )}
                    </span>
                  </div>
                  
                  <div className="w-full bg-gray-700 rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full ${
                        isError ? 'bg-red-500' : 
                        progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${isError ? 100 : progress}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Success message */}
      {!isUploading && uploadSuccessCount > 0 && (
        <div className="mt-4 bg-green-900/20 border border-green-700/30 rounded p-3 flex items-center text-sm">
          <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
          <span className="text-green-400">
            Successfully uploaded {uploadSuccessCount} of {selectedFiles.length} file
            {selectedFiles.length !== 1 ? 's' : ''}
          </span>
          <button 
            className="ml-auto text-gray-400 hover:text-gray-300"
            onClick={clearSelectedFiles}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      
      {/* Error message */}
      {uploadError && (
        <div className="mt-4 bg-red-900/20 border border-red-700/30 rounded p-3 flex items-center text-sm">
          <AlertCircle className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />
          <span className="text-red-400">
            Error: {uploadError}
          </span>
          <button 
            className="ml-auto text-gray-400 hover:text-gray-300"
            onClick={() => setUploadError(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default FixedFileUploader;