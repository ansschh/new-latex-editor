// components/HeaderChatButton.tsx
import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useChat } from '../context/ChatContext';

interface HeaderChatButtonProps {
  className?: string;
}

const HeaderChatButton: React.FC<HeaderChatButtonProps> = ({ className = '' }) => {
  const { toggleChat, unreadCount } = useChat();

  return (
    <button
      onClick={toggleChat}
      className={`relative inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm transition-colors ${className}`}
      title="Chat"
    >
      <MessageSquare className="h-4 w-4 mr-1.5" />
      <span className="hidden sm:inline">Chat</span>
      
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default HeaderChatButton;