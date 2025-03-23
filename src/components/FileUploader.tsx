import React, { useState, useRef } from 'react';
import { Upload, X, Check, AlertCircle, FileText, Image, File, Loader } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

interface FileUploaderProps {
  projectId: string;
  userId: string;
  parentId?: string | null;
  onUploadComplete: () => void;
  className?: string;
}

const EnhancedFileUploader: React.FC<FileUploaderProps> = ({
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
          // For text files, read content and store directly in Firestore
          if (isTextFile(file)) {
            // Simulate progress
            setUploadProgress(prev => ({ ...prev, [file.name]: 30 }));
            
            const content = await readFileAsText(file);
            
            // Update progress
            setUploadProgress(prev => ({ ...prev, [file.name]: 70 }));
            
            // Add file to Firestore
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
          } 
          // For binary files (images, PDFs, etc.), upload to Storage
          else {
            // Create a storage reference
            const fileRef = ref(storage, `projects/${projectId}/files/${file.name}`);
            
            // Upload to Firebase Storage with progress tracking
            // Note: Firebase Storage doesn't directly support progress tracking in v9,
            // so we'll simulate it here
            setUploadProgress(prev => ({ ...prev, [file.name]: 30 }));
            
            await uploadBytes(fileRef, file);
            setUploadProgress(prev => ({ ...prev, [file.name]: 70 }));
            
            // Get download URL
            const downloadURL = await getDownloadURL(fileRef);
            
            // Add metadata to Firestore
            await addDoc(collection(db, "projectFiles"), {
              _name_: file.name,
              type: 'file',
              fileType: 'binary',
              size: file.size,
              storageRef: fileRef.fullPath,
              downloadURL: downloadURL,
              projectId: projectId,
              parentId: parentId,
              ownerId: userId,
              createdAt: serverTimestamp(),
              lastModified: serverTimestamp()
            });
          }
          
          // Mark upload as complete
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
          successCount++;
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
    setSelectedFiles(prevFiles => prevFiles.filter(file => file !== fileToRemove));
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

export default EnhancedFileUploader;