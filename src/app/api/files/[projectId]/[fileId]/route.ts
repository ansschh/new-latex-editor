// app/api/files/[projectId]/[fileId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDoc, doc } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { db } from '@/lib/firebase';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const { projectId, fileId } = params;
    const isDownload = request.nextUrl.searchParams.get('download') === 'true';
    
    if (!projectId || !fileId) {
      return NextResponse.json({ error: 'Project ID and File ID are required' }, { status: 400 });
    }

    // Get file metadata from Firestore
    const fileDoc = await getDoc(doc(db, "projectFiles", fileId));
    
    if (!fileDoc.exists()) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    
    const fileData = fileDoc.data();
    
    // Check if the file is an image or binary file
    const isImage = checkIfImageFile(fileData.name);
    
    // For images, we need to handle different ways they might be stored:
    if (isImage) {
      // Option 1: If using Firebase Storage
      try {
        const storage = getStorage();
        const fileRef = ref(storage, `projects/${projectId}/files/${fileId}`);
        const downloadUrl = await getDownloadURL(fileRef);
        
        // Redirect to the download URL
        return NextResponse.redirect(downloadUrl);
      } catch (storageError) {
        console.log("No file in storage, checking for data URL");
        
        // Option 2: If the image is stored as a data URL in Firestore
        if (fileData.dataUrl) {
          // If a binary file is stored as a data URL, decode and return it
          const contentType = getContentType(fileData.name);
          const arrayBuffer = Uint8Array.from(atob(fileData.dataUrl.split(',')[1]), c => c.charCodeAt(0));
          
          return new NextResponse(arrayBuffer, {
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': isDownload ? `attachment; filename="${fileData.name}"` : 'inline'
            }
          });
        }
        
        // Option 3: If the file is stored with a URL
        if (fileData.url) {
          return NextResponse.redirect(fileData.url);
        }
      }
    }
    
    // If we get here, we couldn't find the image
    return NextResponse.json({ error: 'Image not available' }, { status: 404 });
    
  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Check if file is an image based on extension
function checkIfImageFile(filename: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'];
  const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return imageExtensions.includes(extension);
}

// Get content type based on file extension
function getContentType(filename: string): string {
  const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp'
  };
  
  return contentTypes[extension] || 'application/octet-stream';
}