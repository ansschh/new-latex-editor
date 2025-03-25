// utils/ChatFileUtils.ts
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  doc,
  collection,
  addDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';

/**
 * Interface for file handling result
 */
interface FileHandlingResult {
  success: boolean;
  data?: any;
  url?: string;
  content?: string;
  error?: string;
}

/**
 * Utility class for managing file operations in the chat interface
 */
export class ChatFileUtils {
  /**
   * Upload a file for chat attachment
   * @param file The file to upload
   * @param projectId Current project ID
   * @param userId User ID
   * @returns Promise with upload result
   */
  static async uploadChatFile(
    file: File,
    projectId: string,
    userId: string
  ): Promise<FileHandlingResult> {
    try {
      // Create a reference to the storage location
      const storageRef = ref(storage, `chats/${projectId}/${Date.now()}_${file.name}`);
      
      // Upload the file
      await uploadBytes(storageRef, file);
      
      // Get the download URL
      const downloadURL = await getDownloadURL(storageRef);
      
      // Determine if it's a text file
      const isTextFile = 
        file.type === 'text/plain' || 
        file.name.endsWith('.tex') || 
        file.name.endsWith('.bib') || 
        file.name.endsWith('.md') || 
        file.name.endsWith('.txt');
      
      // For text files, read content
      let content = '';
      if (isTextFile) {
        content = await this.readFileAsText(file);
      }
      
      return {
        success: true,
        url: downloadURL,
        content: content,
        data: {
          name: file.name,
          type: file.type,
          size: file.size,
          url: downloadURL,
          content: isTextFile ? content : null,
          uploadedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error uploading file'
      };
    }
  }
  
  /**
   * Import a file to the project file tree
   * @param file The file to import
   * @param projectId Current project ID
   * @param userId User ID
   * @param parentId Optional parent folder ID
   * @returns Promise with the created file ID
   */
  static async importFileToProject(
    file: File,
    projectId: string,
    userId: string,
    parentId: string | null = null
  ): Promise<FileHandlingResult> {
    try {
      // Read file content
      let content = '';
      const isTextFile = 
        file.type === 'text/plain' || 
        file.name.endsWith('.tex') || 
        file.name.endsWith('.bib') || 
        file.name.endsWith('.md') || 
        file.name.endsWith('.txt');
        
      const isImage = file.type.startsWith('image/');
        
      if (isTextFile) {
        content = await this.readFileAsText(file);
      } else if (isImage) {
        content = await this.readFileAsDataURL(file);
      }
      
      // Create file record in Firestore
      const fileData: Record<string, any> = {
        _name_: file.name,
        name: file.name,
        type: 'file',
        projectId,
        parentId,
        ownerId: userId,
        content: content,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp()
      };
      
      // Add file extension
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension) {
        fileData.extension = extension;
      }
      
      // For images and binary files, store additional data
      if (isImage) {
        fileData.fileType = 'image';
      } else if (!isTextFile) {
        fileData.fileType = 'binary';
        
        // Upload binary file to storage
        const storageRef = ref(storage, `projects/${projectId}/files/${file.name}`);
        await uploadBytes(storageRef, file);
        fileData.downloadURL = await getDownloadURL(storageRef);
      }
      
      // Add to Firestore
      const docRef = await addDoc(collection(db, "projectFiles"), fileData);
      
      return {
        success: true,
        data: {
          id: docRef.id,
          name: file.name,
          type: 'file'
        }
      };
    } catch (error) {
      console.error('Error importing file to project:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error importing file'
      };
    }
  }
  
  /**
   * Get file content from the project files
   * @param fileId The file ID to fetch
   * @returns Promise with the file content
   */
  static async getFileContent(fileId: string): Promise<FileHandlingResult> {
    try {
      // Try in projectFiles first
      const fileRef = doc(db, "projectFiles", fileId);
      let fileDoc = await getDoc(fileRef);
      
      // If not found, try in project_files
      if (!fileDoc.exists()) {
        const altFileRef = doc(db, "project_files", fileId);
        fileDoc = await getDoc(altFileRef);
      }
      
      // If found, return the content
      if (fileDoc.exists()) {
        const data = fileDoc.data();
        return {
          success: true,
          content: data.content || '',
          data: {
            id: fileDoc.id,
            name: data._name_ || data.name || 'Untitled',
            type: data.type || 'file',
            fileType: data.fileType || 'text'
          }
        };
      }
      
      return {
        success: false,
        error: 'File not found'
      };
    } catch (error) {
      console.error('Error getting file content:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting file content'
      };
    }
  }
  
  /**
   * Read file as text
   * @param file The file to read
   * @returns Promise with the file text content
   */
  static readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          resolve(reader.result as string);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  }
  
  /**
   * Read file as data URL
   * @param file The file to read
   * @returns Promise with the file as data URL
   */
  static readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          resolve(reader.result as string);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }
  
  /**
   * Create a file mention string for chat messages
   * @param fileName The file name
   * @param fileId The file ID
   * @returns Formatted mention string
   */
  static createFileMention(fileName: string, fileId: string): string {
    return `@[${fileName}](${fileId})`;
  }
  
  /**
   * Update chat message with file suggestions
   * @param messageId The message ID to update
   * @param sessionId The chat session ID
   * @param suggestion The suggestion content
   * @param range Optional text range information
   * @param fileId Optional target file ID
   */
  static async updateMessageWithSuggestion(
    messageId: string,
    sessionId: string,
    suggestion: string,
    range?: {start: number, end: number},
    fileId?: string
  ): Promise<void> {
    try {
      const messageRef = doc(db, "chatSessions", sessionId, "messages", messageId);
      
      await updateDoc(messageRef, {
        suggestion: {
          text: suggestion,
          range: range || null,
          fileId: fileId || null
        },
        lastModified: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating message with suggestion:', error);
      throw error;
    }
  }
}