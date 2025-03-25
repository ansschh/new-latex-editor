// components/ChatWindow.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Send, Plus, Clock, ChevronDown, Paperclip, File, MessageSquare,
  Folder, // Added missing Folder import
  Download, Check, Loader
} from 'lucide-react';
import ResizablePanel from './ResizablePanel';
import {
  collection,
  query,
  where,
  orderBy,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  onSnapshot,
  Timestamp,
  getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  attachments?: { id: string, type: string, url: string, name: string }[];
  mentions?: { id: string, name: string, type: string }[];
  suggestion?: {
    text: string;
    range?: { start: number, end: number }; // For targeted text replacements
    fileId?: string; // For suggestions related to specific files
  };
}

interface AttachedFile {
  id: string;
  name: string;
  type: string;
  url: string;
  size?: number;
  content?: string; // For text files
}

interface FileMention {
  id: string;
  name: string;
  type: 'file' | 'folder';
}

interface LLMModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: Date;
  messages: ChatMessage[];
  currentModel: LLMModel;
}

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  userId: string;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  currentFileName?: string;
  currentFileId?: string;
  currentFileContent?: string;
  projectFiles?: { id: string, name: string, type: string }[];
  onSuggestionApply?: (suggestion: string, range?: { start: number, end: number }, fileId?: string) => void;
  onSuggestionReject?: () => void;
  onFileSelect?: (fileId: string) => void;
  onFileUpload?: (file: File) => Promise<string>;
}

// Available LLM Models
const AVAILABLE_MODELS: LLMModel[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', providerName: 'OpenAI' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', providerName: 'OpenAI' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic', providerName: 'Anthropic' },
  { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic', providerName: 'Anthropic' },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'google', providerName: 'Google' },
  { id: 'gemini-ultra', name: 'Gemini Ultra', provider: 'google', providerName: 'Google' }
];

// Type guard for file mentions - for use in rendering
const isFileMention = (item: any): item is FileMention => {
  return item &&
    typeof item === 'object' &&
    'id' in item &&
    'name' in item &&
    'type' in item;
};

// Adding performance styles for smooth resizing
const RESIZE_STYLES = `
  body.resizing * {
    pointer-events: none !important;
  }
  
  body.resizing .resize-handle {
    pointer-events: auto !important;
  }
  
  body.resizing .panel-transition {
    transition: none !important;
  }
  
  .resize-handle {
    touch-action: none;
    will-change: transform;
  }
  
  .panel-transition {
    transition: width 0.1s ease, height 0.1s ease;
  }
  
  .chat-window-container {
    transform: translateZ(0);
    backface-visibility: hidden;
    perspective: 1000px;
    contain: layout size style paint;
  }
  
  .message-container {
    contain: content;
    max-width: 100%;
  }

  .messages-container {
    scrollbar-width: thin;
    scrollbar-color: rgba(113, 128, 150, 0.4) rgba(26, 32, 44, 0.1);
    scroll-behavior: smooth;
    overflow-anchor: auto;
  }

  .messages-container::-webkit-scrollbar {
    width: 6px;
  }

  .messages-container::-webkit-scrollbar-track {
    background: rgba(26, 32, 44, 0.1);
    border-radius: 3px;
  }

  .messages-container::-webkit-scrollbar-thumb {
    background: rgba(113, 128, 150, 0.4);
    border-radius: 3px;
  }

  .messages-container::-webkit-scrollbar-thumb:hover {
    background: rgba(113, 128, 150, 0.6);
  }
`;


const ChatWindow: React.FC<ChatWindowProps> = ({
  isOpen,
  onClose,
  projectId,
  userId,
  initialWidth = 350,
  minWidth = 280,
  maxWidth = 600,
  className = '',
  currentFileName = '',
  currentFileId = '',
  currentFileContent = '',
  projectFiles = [],
  onSuggestionApply,
  onSuggestionReject,
  onFileSelect,
  onFileUpload
}) => {
  // State for chat sessions
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [newMessage, setNewMessage] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isAttaching, setIsAttaching] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState(false);
  const [width, setWidth] = useState(initialWidth);

  // File mention state
  const [mentionSearch, setMentionSearch] = useState<string>('');
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionStartPos, setMentionStartPos] = useState<number>(-1);
  const [filteredMentions, setFilteredMentions] = useState<{ id: string, name: string, type: string }[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // Upload error state
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Added for resize performance
  const [isResizing, setIsResizing] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastAppliedWidth = useRef(initialWidth);
  const MOVEMENT_THRESHOLD = 2; // Minimum movement in pixels to trigger resize

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<() => void | null>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = RESIZE_STYLES;
    document.head.appendChild(styleElement);

    return () => {
      if (document.head.contains(styleElement)) {
        document.head.removeChild(styleElement);
      }
    };
  }, []);

  // Load chat sessions from Firestore
  useEffect(() => {
    const loadChatSessions = async () => {
      if (!projectId || !userId) return;

      try {
        setLoading(true);

        // Query for chat sessions related to this project and user
        const chatSessionsRef = collection(db, "chatSessions");
        const q = query(
          chatSessionsRef,
          where("projectId", "==", projectId),
          where("userId", "==", userId),
          orderBy("lastUpdated", "desc")
        );

        const querySnapshot = await getDocs(q);
        const sessions: ChatSession[] = [];

        // Process each session
        for (const doc of querySnapshot.docs) {
          const data = doc.data();

          // Load messages for this session
          const messagesRef = collection(db, "chatSessions", doc.id, "messages");
          const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));
          const messagesSnapshot = await getDocs(messagesQuery);

          const messages: ChatMessage[] = messagesSnapshot.docs.map(msgDoc => {
            const msgData = msgDoc.data();

            return {
              id: msgDoc.id,
              sender: msgData.sender,
              content: msgData.content,
              timestamp: msgData.timestamp.toDate(),
              attachments: msgData.attachments || [],
              mentions: msgData.mentions || [],
              suggestion: msgData.suggestion || null
            };
          });

          // Find the model or use default
          const modelId = data.modelId || 'gpt-4o';
          const model = AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0];

          sessions.push({
            id: doc.id,
            title: data.title || 'New Chat',
            timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
            messages: messages,
            currentModel: model
          });
        }

        setChatSessions(sessions);

        // Create a default session if none exist
        if (sessions.length === 0) {
          await createNewChatInFirestore();
        } else {
          // Set the most recent session as active
          setActiveSessionId(sessions[0].id);
          setActiveSession(sessions[0]);
        }

        setLoading(false);
      } catch (error) {
        console.error("Error loading chat sessions:", error);
        setLoading(false);
      }
    };

    if (isOpen) {
      loadChatSessions();
    }

    return () => {
      // Clean up any listeners when component unmounts
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [projectId, userId, isOpen]);

  // Subscribe to updates for the active session
  useEffect(() => {
    const subscribeToActiveSession = () => {
      // Clean up previous subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (!activeSessionId) return;

      // Set up listener for messages in the active session
      const messagesRef = collection(db, "chatSessions", activeSessionId, "messages");
      const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));

      const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const updatedMessages: ChatMessage[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            sender: data.sender,
            content: data.content,
            timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
            attachments: data.attachments || [],
            mentions: data.mentions || [],
            suggestion: data.suggestion || null
          };
        });

        // Update the active session with new messages
        setActiveSession(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: updatedMessages
          };
        });

        // Also update in the sessions list
        setChatSessions(prev =>
          prev.map(session =>
            session.id === activeSessionId
              ? { ...session, messages: updatedMessages }
              : session
          )
        );
      });

      unsubscribeRef.current = unsubscribe;
    };

    subscribeToActiveSession();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [activeSessionId]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !loading) {
      inputRef.current?.focus();
    }
  }, [isOpen, loading]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (activeSession?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.messages]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowChatHistory(false);
      }
      if (mentionListRef.current && !mentionListRef.current.contains(e.target as Node)) {
        setShowMentionList(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle file mention search filtering
  useEffect(() => {
    if (mentionSearch) {
      const filtered = projectFiles.filter(file =>
        file.name.toLowerCase().includes(mentionSearch.toLowerCase())
      );
      setFilteredMentions(filtered);
      setSelectedMentionIndex(0);
    } else {
      setFilteredMentions(projectFiles);
    }
  }, [mentionSearch, projectFiles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Create a new chat session in Firestore
  const createNewChatInFirestore = async () => {
    try {
      // Create a new session document
      const sessionRef = await addDoc(collection(db, "chatSessions"), {
        userId: userId,
        projectId: projectId,
        title: "New Chat",
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        modelId: 'gpt-4o'
      });

      // Create a new session object
      const newSession: ChatSession = {
        id: sessionRef.id,
        title: "New Chat",
        timestamp: new Date(),
        messages: [],
        currentModel: AVAILABLE_MODELS[0]
      };

      // Update state
      setChatSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      setActiveSession(newSession);

      return newSession;
    } catch (error) {
      console.error("Error creating new chat:", error);
      throw error;
    }
  };

  // Create a new chat and set it as active
  const createNewChat = async () => {
    try {
      await createNewChatInFirestore();
      setShowChatHistory(false);
    } catch (error) {
      console.error("Error creating new chat:", error);
    }
  };

  // Select a chat session
  const selectChatSession = async (sessionId: string) => {
    if (!sessionId || sessionId === activeSessionId) {
      setShowChatHistory(false);
      return;
    }

    // Find the session in our cached data
    const session = chatSessions.find(s => s.id === sessionId);

    if (session) {
      setActiveSessionId(sessionId);
      setActiveSession(session);
    } else {
      // If not found (unlikely), fetch it from Firestore
      try {
        const sessionRef = doc(db, "chatSessions", sessionId);
        const sessionDoc = await getDoc(sessionRef);

        if (sessionDoc.exists()) {
          const data = sessionDoc.data();

          // Load messages
          const messagesRef = collection(db, "chatSessions", sessionId, "messages");
          const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));
          const messagesSnapshot = await getDocs(messagesQuery);

          const messages: ChatMessage[] = messagesSnapshot.docs.map(msgDoc => {
            const msgData = msgDoc.data();
            return {
              id: msgDoc.id,
              sender: msgData.sender,
              content: msgData.content,
              timestamp: msgData.timestamp ? msgData.timestamp.toDate() : new Date(),
              attachments: msgData.attachments || [],
              mentions: msgData.mentions || [],
              suggestion: msgData.suggestion || null
            };
          });

          // Find the model
          const modelId = data.modelId || 'gpt-4o';
          const model = AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0];

          const loadedSession: ChatSession = {
            id: sessionId,
            title: data.title || 'New Chat',
            timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
            messages: messages,
            currentModel: model
          };

          setActiveSession(loadedSession);

          // Add to sessions cache
          setChatSessions(prev => [loadedSession, ...prev.filter(s => s.id !== sessionId)]);
        }
      } catch (error) {
        console.error("Error loading chat session:", error);
      }
    }

    setShowChatHistory(false);
  };

  // Read file as data URL
  const readAsDataURL = (file: File): Promise<string> => {
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
  };

  // Read file as text
  const readAsText = (file: File): Promise<string> => {
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
  };

  // Handle inserting mentions into message text
  const insertMention = (mention: { id: string, name: string, type: string }) => {
    if (mentionStartPos < 0) return;

    const beforeMention = newMessage.substring(0, mentionStartPos);
    const afterMention = newMessage.substring(mentionStartPos);

    // Replace the "@..." part with the selected mention
    const textWithoutMentionChar = afterMention.substring(afterMention.indexOf('@') + 1);
    const remainingText = textWithoutMentionChar.includes(' ')
      ? textWithoutMentionChar.substring(textWithoutMentionChar.indexOf(' '))
      : '';

    // Update the message with the mention syntax
    setNewMessage(`${beforeMention}@[${mention.name}](${mention.id}) ${remainingText}`);

    // Hide the mention list
    setShowMentionList(false);
    setMentionSearch('');

    // Focus back on input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  // Parse message to extract mentions
  const parseMentions = (message: string): { text: string, mentions: { id: string, name: string, type: string }[] } => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions: { id: string, name: string, type: string }[] = [];

    // Find all mentions in the format @[name](id)
    let match;
    while ((match = mentionRegex.exec(message)) !== null) {
      const name = match[1];
      const id = match[2];

      // Try to find the file type
      const fileInfo = projectFiles.find(f => f.id === id);
      const type = fileInfo?.type || 'file';

      mentions.push({ id, name, type });
    }

    // Replace mentions with plain text version for storage
    const text = message.replace(mentionRegex, '@$1');

    return { text, mentions };
  };

  // Render message with mentions highlighted
  const renderMessageWithMentions = (message: string, mentions: { id: string, name: string, type: string }[] = []) => {
    if (!mentions || mentions.length === 0) {
      return message;
    }

    // Create a map of mentions for quick lookup
    const mentionMap = new Map<string, { id: string, name: string, type: string }>();
    mentions.forEach(mention => {
      mentionMap.set(mention.name, mention);
    });

    // Split the message by @ symbol
    const parts = message.split('@');

    if (parts.length === 1) {
      return message; // No @ symbols
    }

    // Render each part, checking for mentions
    return (
      <>
        {parts[0]}
        {parts.slice(1).map((part, index) => {
          // Check if this part starts with a mention name
          const mentionName = mentions.find(m => part.startsWith(m.name))?.name;

          if (mentionName) {
            const mention = mentionMap.get(mentionName);
            const restOfText = part.substring(mentionName.length);

            return (
              <React.Fragment key={`mention-${index}`}>
                <span
                  className="inline-flex items-center bg-blue-600/30 px-1.5 rounded-md text-blue-300 cursor-pointer hover:bg-blue-600/40"
                  onClick={() => mention && onFileSelect && onFileSelect(mention.id)}
                >
                  @{mentionName}
                </span>
                {restOfText}
              </React.Fragment>
            );
          }

          return <React.Fragment key={`text-${index}`}>@{part}</React.Fragment>;
        })}
      </>
    );
  };

  // Send a message to the active chat session
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() && attachedFiles.length === 0) return;
    if (!activeSessionId) return;

    try {
      // Parse mentions and get clean text
      const { text: cleanText, mentions } = parseMentions(newMessage);

      // Upload attachments first if any
      const attachmentData = [];

      if (attachedFiles.length > 0) {
        for (const file of attachedFiles) {
          attachmentData.push({
            id: file.id,
            name: file.name,
            type: file.type,
            url: file.url,
            content: file.content
          });
        }
      }

      // Create user message in Firestore
      const messageRef = await addDoc(
        collection(db, "chatSessions", activeSessionId, "messages"),
        {
          sender: "You",
          content: cleanText,
          timestamp: serverTimestamp(),
          attachments: attachmentData.length > 0 ? attachmentData : null,
          mentions: mentions.length > 0 ? mentions : null
        }
      );

      // Update session's last updated time and title if it's the first message
      const sessionRef = doc(db, "chatSessions", activeSessionId);
      const sessionDoc = await getDoc(sessionRef);

      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        const messageCount = sessionData.messageCount || 0;

        const updateData: any = {
          lastUpdated: serverTimestamp(),
          messageCount: messageCount + 1
        };

        // Update title if this is the first message
        if (messageCount === 0 && cleanText.trim()) {
          updateData.title = cleanText.substring(0, 20) + (cleanText.length > 20 ? '...' : '');
        }

        await updateDoc(sessionRef, updateData);
      }

      // Clear input state
      setNewMessage('');
      setAttachedFiles([]);

      // Make API call to get response from LLM (simulation for now)
      setTimeout(async () => {
        try {
          const model = activeSession?.currentModel || AVAILABLE_MODELS[0];

          // Prepare context for the AI
          let systemContext = "";

          // Add current file information if available
          if (currentFileId && currentFileName) {
            systemContext += `The user is currently viewing file: ${currentFileName}\n`;

            if (currentFileContent) {
              systemContext += `File content:\n\`\`\`\n${currentFileContent.substring(0, 1000)}${currentFileContent.length > 1000 ? '...' : ''}\n\`\`\`\n`;
            }
          }

          // In a real app, you'd call your API here with the model selection
          // For simulation, let's create a response that includes:
          // 1. A reference to the current file
          // 2. A LaTeX suggestion with inline changes
          let responseText = `I've analyzed your request about ${cleanText}.\n\n`;

          // If we have a current file, add a suggestion
          if (currentFileName && currentFileName.endsWith(".tex")) {
            responseText += `Here's a suggestion for improving your LaTeX document:\n\n\`\`\`latex\n\\begin{equation}\n    E = mc^2\n\\end{equation}\n\`\`\`\n\nYou can add this equation to your document.`;
          } else {
            responseText += `I can help you with LaTeX formatting. If you open a .tex file, I can provide specific suggestions for your document.`;
          }

          // Add the assistant's response to Firestore
          // In a real implementation, this would come from your API
          const assistantMessage = {
            sender: "LaTeX Assistant",
            content: responseText,
            timestamp: serverTimestamp(),
            mentions: currentFileId ? [{ id: currentFileId, name: currentFileName, type: 'file' }] : null,
            // Add a suggestion for demonstration
            suggestion: currentFileId ? {
              text: "\\begin{equation}\n    E = mc^2\n\\end{equation}",
              fileId: currentFileId,
              range: { start: 100, end: 100 } // This would be a real position in the document
            } : null
          };

          await addDoc(
            collection(db, "chatSessions", activeSessionId, "messages"),
            assistantMessage
          );

          // Get session data and update message count
          const sessionSnapshot = await getDoc(sessionRef);
          const sessionData = sessionSnapshot.data();
          const messageCount = sessionData ? (sessionData.messageCount || 0) : 0;
          await updateDoc(sessionRef, {
            messageCount: messageCount + 2,
            lastUpdated: serverTimestamp()
          });

        } catch (error) {
          console.error("Error sending assistant message:", error);
        }
      }, 1000);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Optimized panel resize handler using requestAnimationFrame
  const handlePanelResize = useCallback((newSize: number) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // Use RAF for smooth updates
    rafRef.current = requestAnimationFrame(() => {
      // Check if the change exceeds the threshold to avoid micro jitters
      if (Math.abs(newSize - lastAppliedWidth.current) >= MOVEMENT_THRESHOLD) {
        lastAppliedWidth.current = newSize;
        setWidth(newSize);
      }
      rafRef.current = null;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);


  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If mention list is open, navigate through it
    if (showMentionList) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev =>
          prev < filteredMentions.length - 1 ? prev + 1 : prev
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : 0);
        return;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredMentions.length > 0) {
          insertMention(filteredMentions[selectedMentionIndex]);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionList(false);
        return;
      }
    } else {
      // Normal message sending
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage(e);
      }
    }
  };

  // Update the model selection in Firestore
  const updateSelectedModel = async (model: LLMModel) => {
    if (!activeSessionId) return;

    try {
      const sessionRef = doc(db, "chatSessions", activeSessionId);

      await updateDoc(sessionRef, {
        modelId: model.id,
        lastUpdated: serverTimestamp()
      });

      // Update local state
      setActiveSession(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          currentModel: model
        };
      });

      setChatSessions(prev =>
        prev.map(session =>
          session.id === activeSessionId
            ? { ...session, currentModel: model }
            : session
        )
      );

      setShowModelDropdown(false);
    } catch (error) {
      console.error("Error updating model:", error);
    }
  };

  // Monitor input for @ mentions
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    // Get cursor position
    const cursorPos = e.target.selectionStart || 0;
    setMentionStartPos(cursorPos);

    // Check if we're typing a mention (after @ and not in the middle of another word)
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbol !== -1) {
      // Make sure @ isn't part of another word (has space or is at start)
      const charBeforeAt = lastAtSymbol > 0 ? textBeforeCursor[lastAtSymbol - 1] : ' ';

      if (charBeforeAt === ' ' || lastAtSymbol === 0) {
        // Extract search text after @
        const mentionText = textBeforeCursor.substring(lastAtSymbol + 1);

        // If we're in a valid mention context
        if (!mentionText.includes(' ')) {
          setMentionSearch(mentionText);
          setShowMentionList(true);
          return;
        }
      }
    }

    // If we reach here, we're not in a mention context
    setShowMentionList(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    await uploadFiles(Array.from(files));

    // Reset the input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    await uploadFiles(files);
  };

  const uploadFiles = async (files: File[]) => {
    setIsAttaching(true);
    setUploadError(null);

    try {
      const newAttachments: AttachedFile[] = [];

      for (const file of files) {
        try {
          // Update progress to "starting"
          setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

          // Determine file type
          const isTextFile = file.type === 'text/plain' ||
            file.name.endsWith('.tex') ||
            file.name.endsWith('.md') ||
            file.name.endsWith('.bib');

          const isImage = file.type.startsWith('image/');

          // Process based on type
          let fileUrl = '';
          let fileContent = '';

          if (isTextFile) {
            // For text files, read content
            setUploadProgress(prev => ({ ...prev, [file.name]: 30 }));
            fileContent = await readAsText(file);

            // Upload to Firebase Storage
            if (onFileUpload) {
              setUploadProgress(prev => ({ ...prev, [file.name]: 60 }));
              fileUrl = await onFileUpload(file);
            } else {
              // Use Firebase Storage directly
              const storageRef = ref(storage, `chats/${projectId}/${Date.now()}_${file.name}`);
              await uploadBytes(storageRef, file);
              fileUrl = await getDownloadURL(storageRef);
            }
          } else if (isImage) {
            // For images, create a thumbnail preview
            setUploadProgress(prev => ({ ...prev, [file.name]: 30 }));
            fileContent = await readAsDataURL(file);

            // Upload to Firebase Storage
            if (onFileUpload) {
              setUploadProgress(prev => ({ ...prev, [file.name]: 60 }));
              fileUrl = await onFileUpload(file);
            } else {
              // Use Firebase Storage directly
              const storageRef = ref(storage, `chats/${projectId}/${Date.now()}_${file.name}`);
              await uploadBytes(storageRef, file);
              fileUrl = await getDownloadURL(storageRef);
            }
          } else {
            // For other files, just upload
            if (onFileUpload) {
              setUploadProgress(prev => ({ ...prev, [file.name]: 50 }));
              fileUrl = await onFileUpload(file);
            } else {
              // Use Firebase Storage directly
              const storageRef = ref(storage, `chats/${projectId}/${Date.now()}_${file.name}`);
              await uploadBytes(storageRef, file);
              fileUrl = await getDownloadURL(storageRef);
            }
          }

          // Mark as complete
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));

          newAttachments.push({
            id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            name: file.name,
            type: file.type,
            url: fileUrl,
            size: file.size,
            content: fileContent
          });
        } catch (fileError) {
          console.error(`Error uploading file ${file.name}:`, fileError);
          setUploadProgress(prev => ({ ...prev, [file.name]: -1 }));
        }
      }

      setAttachedFiles(prev => [...prev, ...newAttachments]);

      // Clear progress after a delay
      setTimeout(() => {
        const failedFiles = Object.entries(uploadProgress)
          .filter(([_, progress]) => progress === -1)
          .map(([filename]) => filename);

        if (failedFiles.length > 0) {
          setUploadError(`Failed to upload: ${failedFiles.join(', ')}`);
        }

        setUploadProgress({});
      }, 3000);
    } catch (error) {
      console.error('Error uploading files:', error);
      setUploadError('Error uploading files. Please try again.');
    } finally {
      setIsAttaching(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles(prev => prev.filter(file => file.id !== id));
  };

  // Safe file icon getter
  const getFileIcon = (fileType: string) => {
    if (fileType === 'folder') {
      return <Folder className="h-4 w-4 mr-2 text-blue-400" />;
    } else {
      return <File className="h-4 w-4 mr-2 text-gray-400" />;
    }
  };

  if (!isOpen) return null;

  const messages = activeSession?.messages || [];

  return (
    <div className={`h-full flex-shrink-0 shadow-lg flex chat-window-container ${className} ${isResizing ? 'resizing' : ''}`}
      style={{ width: `${width}px` }}
    >
      <ResizablePanel
        direction="horizontal"
        initialSize={width}
        minSize={minWidth}
        maxSize={maxWidth}
        onChange={handlePanelResize}
        onResizeStart={() => setIsResizing(true)}
        onResizeEnd={() => setIsResizing(false)}
        className={`flex flex-col h-full w-full relative bg-[#1e1e1e] will-change-width ${isResizing ? 'resizing' : ''}`}
        resizeFrom="start"
      >
        {/* Header - CHAT title and Actions */}
        <div className="flex items-center justify-between border-b border-gray-800">
          {/* Chat title - just the CHAT heading */}
          <div className="flex text-xs text-white">
            <div className="px-4 py-1.5 uppercase border-b-2 border-white">
              CHAT
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center">
            <button
              className="p-1 text-gray-400 hover:text-gray-300"
              onClick={createNewChat}
              title="New chat"
            >
              <Plus className="h-5 w-5" />
            </button>

            {/* Chat History Button */}
            <div className="relative" ref={historyRef}>
              <button
                className="p-1 text-gray-400 hover:text-gray-300"
                onClick={() => setShowChatHistory(!showChatHistory)}
                title="Chat history"
              >
                <Clock className="h-5 w-5" />
              </button>

              {/* Chat History Dropdown */}
              {showChatHistory && (
                <div className="absolute right-0 top-full mt-1 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-lg z-20 w-64">
                  <div className="py-1 max-h-80 overflow-y-auto">
                    <div className="px-3 py-2 text-xs text-gray-400 uppercase">Recent chats</div>
                    {chatSessions.map(session => (
                      <button
                        key={session.id}
                        onClick={() => selectChatSession(session.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center ${activeSessionId === session.id
                          ? 'bg-[#04395e] text-white'
                          : 'text-gray-300 hover:bg-[#2a2d2e]'
                          }`}
                      >
                        <span className="truncate">{session.title || 'New Chat'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex-1 flex items-center justify-center bg-[#1e1e1e]">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Chat Content Area with drop zone */}
        {!loading && (
  <div 
    className="flex-1 relative flex flex-col overflow-hidden" // Added flex flex-col here
    onDragOver={handleDragOver}
    onDragLeave={handleDragLeave}
    onDrop={handleDrop}
  >
            {/* Drop indicator overlay */}
            {dragActive && (
      <div className="absolute inset-0 flex items-center justify-center bg-blue-900/20 z-10">
        <div className="bg-gray-800 rounded-lg p-4 shadow-lg">
          <p className="text-center text-white">Drop file to attach to your message</p>
        </div>
      </div>
    )}

            {/* Empty State (when no messages) */}
            {messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
                <div className="mb-4 bg-gray-700 rounded-full p-4 opacity-60">
                  <div className="w-16 h-16 flex items-center justify-center">
                    <MessageSquare className="h-10 w-10 text-white opacity-70" />
                  </div>
                </div>
                <h2 className="text-2xl font-light text-gray-300 mb-2">LaTeX Assistant</h2>
                <p className="text-gray-400 text-sm max-w-xs">
                  Ask me anything about LaTeX. I can help format equations, create tables,
                  fix errors, and suggest improvements for your document.
                </p>

                <div className="mt-10 flex flex-col space-y-4 text-sm w-full max-w-xs opacity-80">
                  <div className="flex items-center text-blue-400">
                    <span className="mr-2 font-mono">@</span>
                    <span>Type @ to reference project files</span>
                  </div>
                  <div className="flex items-center text-blue-400">
                    <Paperclip className="h-4 w-4 mr-2 opacity-70" />
                    <span>Attach images or files for help</span>
                  </div>
                  <div className="flex items-center text-blue-400">
                    <span className="mr-2 font-mono">/</span>
                    <span>Type / to use commands</span>
                  </div>
                </div>
              </div>
            )}

            {/* Messages (when there are messages) */}
            {messages.length > 0 && (
              <div className="flex-1 overflow-y-auto p-3 space-y-4 mb-0">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex flex-col message-container">
                    {/* Sender Badge */}
                    <div className="text-xs text-gray-400 mb-1">
                      {msg.sender === 'You' ? 'You' : 'LaTeX Assistant'}
                    </div>

                    {/* Message Content */}
                    <div
                      className={`max-w-3xl rounded-lg px-3 py-2 ${msg.sender === 'You'
                          ? 'bg-blue-600/20 text-white'
                          : 'bg-gray-800 text-white'
                        }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.mentions && msg.mentions.length > 0
                          ? renderMessageWithMentions(msg.content, msg.mentions)
                          : msg.content
                        }
                      </p>

                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {msg.attachments.map(file => (
                            <div key={file.id} className="bg-gray-900 rounded p-2 flex items-center">
                              <File className="h-4 w-4 mr-2 text-blue-400" />
                              <span className="text-xs text-gray-300 truncate mr-2">{file.name}</span>

                              {/* Preview/download action */}
                              {file.url && (
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-400 hover:text-blue-300 ml-auto"
                                >
                                  View
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* LaTeX Assistant suggestion buttons */}
                    {msg.sender === 'LaTeX Assistant' && msg.suggestion && (
                      <div className="flex space-x-2 mt-2">
                        <button
                          onClick={() => onSuggestionApply && onSuggestionApply(
                            msg.suggestion?.text || '',
                            msg.suggestion?.range,
                            msg.suggestion?.fileId
                          )}
                          className="bg-blue-600 text-white text-xs py-1 px-2 rounded hover:bg-blue-700"
                        >
                          Apply Suggestion
                        </button>
                        <button
                          onClick={() => onSuggestionReject && onSuggestionReject()}
                          className="bg-gray-700 text-gray-300 text-xs py-1 px-2 rounded hover:bg-gray-600"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        )}

        {/* Input Area */}
        {!loading && (
          <div className="p-4 mt-auto">
            {/* Current file badge */}
            {currentFileName && (
              <div className="flex mb-2">
                <div
                  className="inline-flex items-center bg-[#252526] text-gray-300 text-xs rounded px-2 py-1 cursor-pointer hover:bg-[#303031]"
                  onClick={() => onFileSelect && currentFileId && onFileSelect(currentFileId)}
                >
                  <File className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                  <span className="mr-1">{currentFileName}</span>
                  <span className="text-gray-500">Current file</span>
                </div>
              </div>
            )}

            {/* Upload progress and errors */}
            {Object.keys(uploadProgress).length > 0 && (
              <div className="mb-2 bg-[#252526] rounded p-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Uploading files...</span>
                  <span>
                    {Object.values(uploadProgress).filter(p => p === 100).length} / {Object.keys(uploadProgress).length}
                  </span>
                </div>
                {Object.entries(uploadProgress).map(([fileName, progress]) => (
                  <div key={fileName} className="mb-1">
                    <div className="flex items-center text-xs mb-0.5">
                      <span className="truncate flex-1 text-gray-400">{fileName}</span>
                      <span className="text-gray-500 ml-2">
                        {progress < 0 ? 'Error' : progress === 100 ? 'Complete' : `${progress}%`}
                      </span>
                    </div>
                    <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${progress < 0 ? 'bg-red-500' :
                          progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                        style={{ width: `${progress < 0 ? 100 : progress}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload error message */}
            {uploadError && (
              <div className="mb-2 bg-red-900/20 border border-red-800/50 rounded px-3 py-2 text-xs text-red-400">
                {uploadError}
              </div>
            )}

            {/* Attachments preview */}
            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachedFiles.map(file => (
                  <div key={file.id} className="bg-[#252526] rounded flex items-center pl-2 pr-1 py-1">
                    <File className="h-3 w-3 mr-1 text-blue-400" />
                    <span className="text-xs text-gray-300 mr-1 max-w-[150px] truncate">{file.name}</span>
                    <button
                      onClick={() => removeAttachment(file.id)}
                      className="text-gray-500 hover:text-gray-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input box */}
            <div className="bg-[#252526] rounded-md border border-[#3c3c3c] relative">
              <form onSubmit={handleSendMessage} className="flex flex-col">
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about LaTeX... (Type @ to mention files)"
                  className="w-full bg-transparent text-gray-200 py-2 px-3 text-sm focus:outline-none"
                />

                {/* File mention dropdown */}
                {showMentionList && filteredMentions.length > 0 && (
                  <div
                    ref={mentionListRef}
                    className="absolute bottom-full left-0 mb-1 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-lg max-h-60 overflow-y-auto w-64 z-10"
                  >
                    <div className="py-1">
                      {filteredMentions.map((file, index) => (
                        <div
                          key={file.id}
                          onClick={() => insertMention(file)}
                          className={`px-3 py-2 text-sm flex items-center cursor-pointer ${index === selectedMentionIndex ? 'bg-[#04395e] text-white' : 'text-gray-300 hover:bg-[#2a2d2e]'
                            }`}
                        >
                          {file.type === 'folder' ? (
                            <Folder className="h-4 w-4 mr-2 text-blue-400" />
                          ) : (
                            <File className="h-4 w-4 mr-2 text-gray-400" />
                          )}
                          <span className="truncate">{file.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Button bar - simplified with just paperclip */}
                <div className="flex justify-between items-center px-2 py-1.5 border-t border-[#3c3c3c]">
                  <div>
                    <button
                      type="button"
                      className="p-1 text-gray-500 hover:text-gray-300 rounded"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" />
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        multiple
                      />
                    </button>
                  </div>

                  <div className="flex items-center">
                    {/* Model selection dropdown - improved design */}
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="mr-2 flex items-center text-xs bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 hover:bg-[#2d2d2d]"
                      >
                        <span>{activeSession?.currentModel.name || AVAILABLE_MODELS[0].name}</span>
                        <ChevronDown className="h-3 w-3 ml-1.5" />
                      </button>

                      {/* Improved Dropdown Menu */}
                      {showModelDropdown && (
                        <div className="absolute bottom-full right-0 mb-1 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-lg z-10 min-w-[180px]">
                          <div className="py-1">
                            {AVAILABLE_MODELS.map(model => (
                              <button
                                key={model.id}
                                type="button"
                                onClick={() => updateSelectedModel(model)}
                                className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center ${(activeSession?.currentModel.id || AVAILABLE_MODELS[0].id) === model.id
                                  ? 'bg-[#04395e] text-white'
                                  : 'text-gray-300 hover:bg-[#2a2d2e]'
                                  }`}
                              >
                                <span>{model.name}</span>
                                <span className="text-xs text-gray-500">{model.providerName}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={(!newMessage.trim() && attachedFiles.length === 0) || !activeSessionId}
                      className={`p-1 ${(!newMessage.trim() && attachedFiles.length === 0) || !activeSessionId
                        ? 'text-gray-500 cursor-not-allowed'
                        : 'text-gray-300 hover:text-white'
                        }`}
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </ResizablePanel>
    </div>
  );
};

export default ChatWindow;