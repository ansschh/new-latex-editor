// utils/FileMentionUtils.ts
import React from 'react';

export interface FileMention {
  id: string;
  name: string;
  type: 'file' | 'folder';
}

export interface TextWithMentions {
  text: string;
  mentions: FileMention[];
}

// Regular expression to match mentions in the format @[name](id)
const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Parse text to extract mentions
 * @param text Message text with mentions in the format @[name](id)
 * @param availableFiles List of all files in the project (for type lookup)
 * @returns Object containing clean text and extracted mentions
 */
export const parseMentions = (
  text: string, 
  availableFiles: {id: string, name: string, type: string}[]
): TextWithMentions => {
  const mentions: FileMention[] = [];
  
  // Find all mentions in the format @[name](id)
  let match;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const name = match[1];
    const id = match[2];
    
    // Try to find the file type
    const fileInfo = availableFiles.find(f => f.id === id);
    const type = fileInfo?.type === 'folder' ? 'folder' : 'file';
    
    mentions.push({ id, name, type });
  }
  
  // Replace mentions with plain text version for storage
  const cleanText = text.replace(MENTION_REGEX, '@$1');
  
  return { text: cleanText, mentions };
};

/**
 * Render text with mentions as React elements
 * @param text Message text containing mentions
 * @param mentions Array of file mentions
 * @param onMentionClick Callback for when a mention is clicked
 * @returns React element with formatted mentions
 */
export const renderTextWithMentions = (
  text: string, 
  mentions: FileMention[] = [],
  onMentionClick?: (id: string) => void
): React.ReactNode => {
  if (!mentions || mentions.length === 0) {
    return text;
  }
  
  // Create a map of mentions for quick lookup
  const mentionMap = new Map<string, FileMention>();
  mentions.forEach(mention => {
    mentionMap.set(mention.name, mention);
  });
  
  // Split the message by @ symbol
  const parts = text.split('@');
  
  if (parts.length === 1) {
    return text; // No @ symbols
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
                onClick={() => mention && onMentionClick && onMentionClick(mention.id)}
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

/**
 * Format a message with code blocks and syntax highlighting
 * @param text Message text that may contain code blocks
 * @returns React element with formatted code blocks
 */
export const formatMessageWithCodeBlocks = (text: string): React.ReactNode => {
  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);
  
  return (
    <>
      {parts.map((part, index) => {
        // Check if this is a code block
        if (part.startsWith('```') && part.endsWith('```')) {
          // Extract language and code
          const firstLineEnd = part.indexOf('\n');
          const language = part.substring(3, firstLineEnd).trim();
          const code = part.substring(firstLineEnd + 1, part.length - 3).trim();
          
          return (
            <div key={`code-${index}`} className="my-2 rounded-md overflow-hidden bg-gray-900">
              {language && (
                <div className="bg-gray-800 px-3 py-1 text-xs text-gray-400 font-mono border-b border-gray-700">
                  {language}
                </div>
              )}
              <pre className="p-3 text-xs overflow-x-auto">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        
        // Regular text
        return <span key={`text-${index}`}>{part}</span>;
      })}
    </>
  );
};

/**
 * Extract a suggested change from a message with code blocks
 * @param text Message text that contains code blocks
 * @returns Object containing the code block and its language
 */
export const extractSuggestion = (text: string): { code: string, language: string } | null => {
  // Match code blocks
  const codeBlockRegex = /```([a-z]*)\n([\s\S]*?)```/g;
  const match = codeBlockRegex.exec(text);
  
  if (match) {
    const language = match[1].trim();
    const code = match[2].trim();
    return { code, language };
  }
  
  return null;
};

/**
 * Create a message with a file mention
 * @param fileName Name of the file to mention
 * @param fileId ID of the file to mention
 * @returns Text with the file mention formatted correctly
 */
export const createMentionMessage = (fileName: string, fileId: string): string => {
  return `@[${fileName}](${fileId})`;
};