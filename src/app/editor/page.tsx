"use client";

import React from 'react';
import dynamic from 'next/dynamic';
import { UserButton } from '@clerk/nextjs';

// Prevent SSR for the editor component
const LatexEditor = dynamic(() => import('@/components/LatexEditor'), { 
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-900">
      <div className="text-xl text-white">Loading Editor...</div>
    </div>
  )
});

export default function EditorPage() {
  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center">
          <div className="text-xl font-bold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
            LaTeX Scholar
          </div>
          <div className="flex space-x-4 ml-10">
            <button className="text-sm text-gray-300 hover:text-white">File</button>
            <button className="text-sm text-gray-300 hover:text-white">Edit</button>
            <button className="text-sm text-gray-300 hover:text-white">View</button>
            <button className="text-sm text-gray-300 hover:text-white">Help</button>
          </div>
        </div>
        <UserButton 
          appearance={{
            elements: {
              userButtonAvatarBox: "h-8 w-8"
            }
          }} 
        />
      </header>
      
      <main className="flex-1">
        <LatexEditor />
      </main>
    </div>
  );
}