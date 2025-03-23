"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Download, AlertCircle, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ImagePreviewProps {
  filename: string;
  fileId: string;
  projectId: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ 
  filename, 
  fileId,
  projectId
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch the image data from Firestore
  useEffect(() => {
    const fetchImageData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        console.log(`Looking for image data for file: ${filename}, ID: ${fileId}`);
        
        // Try both collection names since there might be inconsistency
        const possibleCollections = ["projectFiles", "project_files"];
        let fileData = null;
        let foundDoc = false;
        
        // First try direct document lookup in both collections
        for (const collectionName of possibleCollections) {
          try {
            console.log(`Trying direct lookup in collection: ${collectionName}`);
            const fileDoc = await getDoc(doc(db, collectionName, fileId));
            if (fileDoc.exists()) {
              fileData = fileDoc.data();
              foundDoc = true;
              console.log(`Found file document in collection: ${collectionName}`, fileData);
              break;
            }
          } catch (err) {
            console.log(`Document not found in ${collectionName}`);
          }
        }
        
        // If direct lookup fails, try querying by project ID and filename
        if (!foundDoc) {
          console.log("Direct document lookup failed, trying query by projectId and filename");
          for (const collectionName of possibleCollections) {
            try {
              const filesQuery = query(
                collection(db, collectionName),
                where("projectId", "==", projectId),
                where("_name_", "==", filename)
              );
              
              const querySnapshot = await getDocs(filesQuery);
              if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                fileData = doc.data();
                foundDoc = true;
                console.log(`Found file by query in collection: ${collectionName}`, fileData);
                break;
              }
            } catch (err) {
              console.log(`Query failed in ${collectionName}:`, err);
            }
          }
        }
        
        if (!foundDoc || !fileData) {
          console.error(`File document not found for ID: ${fileId}`);
          setError(`File not found. Please check if the file exists in the project.`);
          setIsLoading(false);
          return;
        }
        
        console.log("File data fields:", Object.keys(fileData));
        
        // Check every possible field that might contain image data
        if (fileData.dataUrl) {
          console.log("Using dataUrl field");
          setImageUrl(fileData.dataUrl);
        } else if (fileData.downloadURL) {
          console.log("Using downloadURL field");
          setImageUrl(fileData.downloadURL);
        } else if (fileData.url) {
          console.log("Using url field");
          setImageUrl(fileData.url);
        } else if (fileData.content && typeof fileData.content === 'string') {
          // Check if content is a data URL
          if (fileData.content.startsWith('data:image')) {
            console.log("Using content field with data:image prefix");
            setImageUrl(fileData.content);
          } 
          // Check if content is a base64 string (without data:image prefix)
          else if (fileData.content.match(/^[A-Za-z0-9+/=]+$/)) {
            console.log("Using content field as base64 data");
            // Determine image type from filename
            let mimeType = 'image/jpeg'; // Default
            if (filename.toLowerCase().endsWith('.png')) mimeType = 'image/png';
            else if (filename.toLowerCase().endsWith('.gif')) mimeType = 'image/gif';
            else if (filename.toLowerCase().endsWith('.svg')) mimeType = 'image/svg+xml';
            else if (filename.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
            
            setImageUrl(`data:${mimeType};base64,${fileData.content}`);
          }
        } else {
          // As a last resort, try to find any field with a data URL pattern or URL
          const foundField = Object.entries(fileData).find(([key, value]) => 
            typeof value === 'string' && 
            (
              (value as string).startsWith('data:image') || 
              ((value as string).startsWith('http') && 
              /\.(jpg|jpeg|png|gif|svg|webp)/.test(value as string))
            )
          );
          
          if (foundField) {
            console.log(`Found image data in field: ${foundField[0]}`);
            setImageUrl(foundField[1] as string);
          } else {
            console.error("No image data found in any field");
            setError("No image data found in file document. The file may not be a valid image or may be corrupted.");
          }
        }
      } catch (err) {
        console.error("Error fetching image:", err);
        setError(`Failed to fetch image data: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (fileId) {
      fetchImageData();
    }
  }, [fileId, filename, projectId]);

  // Handle zoom in
  const handleZoomIn = () => {
    setZoom(prevZoom => Math.min(prevZoom + 25, 300));
  };

  // Handle zoom out
  const handleZoomOut = () => {
    setZoom(prevZoom => Math.max(prevZoom - 25, 50));
  };

  // Handle rotation
  const handleRotate = () => {
    setRotation(prevRotation => (prevRotation + 90) % 360);
  };

  // Function to trigger image download
  const handleDownload = () => {
    if (!imageUrl) return;
    
    // Create an anchor element and trigger download
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900" ref={containerRef}>
      {/* Header with filename and controls */}
      <div className="bg-gray-800 p-2 flex justify-between items-center border-b border-gray-700">
        <div className="text-gray-200 font-medium truncate">{filename}</div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 50 || !imageUrl}
            className={`p-1.5 rounded ${!imageUrl || zoom <= 50 ? 'text-gray-600' : 'text-gray-300 hover:bg-gray-700'}`}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          
          <span className="text-xs text-gray-300 mx-1">{zoom}%</span>
          
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 300 || !imageUrl}
            className={`p-1.5 rounded ${!imageUrl || zoom >= 300 ? 'text-gray-600' : 'text-gray-300 hover:bg-gray-700'}`}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          
          <button
            onClick={handleRotate}
            disabled={!imageUrl}
            className={`p-1.5 rounded ${!imageUrl ? 'text-gray-600' : 'text-gray-300 hover:bg-gray-700'}`}
            title="Rotate"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          
          <div className="w-px h-4 bg-gray-700 mx-1"></div>
          
          <button
            onClick={handleDownload}
            disabled={!imageUrl}
            className={`px-3 py-1 rounded flex items-center ${
              imageUrl 
                ? "bg-blue-600 hover:bg-blue-700 text-white" 
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
            title="Download image"
          >
            <Download className="h-4 w-4 mr-1" />
            Download
          </button>
        </div>
      </div>

      {/* Image content */}
      <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
            <p className="mt-4 text-gray-400">Loading image...</p>
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-6 max-w-md text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-400 mb-2">Error Loading Image</h3>
            <p className="text-red-300 mb-4">{error}</p>
            <p className="text-gray-400 text-sm">
              This may happen if the image was not properly saved in the database or if 
              the file format is not supported.
            </p>
          </div>
        ) : imageUrl ? (
          <div className="relative inline-flex items-center justify-center max-w-full max-h-full">
            <img
              src={imageUrl}
              alt={filename}
              className="object-contain max-w-full max-h-full"
              style={{ 
                transform: `scale(${zoom/100}) rotate(${rotation}deg)`,
                transition: 'transform 0.3s ease'
              }}
              onError={(e) => {
                console.error("Image failed to load:", e);
                setError("Failed to display image: Invalid image format or URL");
              }}
            />
          </div>
        ) : (
          <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg p-6 max-w-md text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-yellow-400 mb-2">No Image Data Found</h3>
            <p className="text-yellow-300">
              The file exists but doesn't contain image data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePreview;