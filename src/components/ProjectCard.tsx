"use client";

import Link from "next/link";
import { File, MoreHorizontal, Download, Share2, Copy } from "lucide-react";

export default function ProjectCard({ project, onSelect, isSelected }) {
  const getTagColor = (tagName) => {
    return "bg-gray-100 text-gray-800";
  };

  const formattedDate = project.lastModified?.seconds
    ? new Date(project.lastModified.seconds * 1000).toLocaleDateString()
    : "";

  // Determine which icon to show based on project type
  const getProjectIcon = () => {
    switch (project.type) {
      case "article":
        return <File className="h-10 w-10 text-teal-500" />;
      case "report":
        return <File className="h-10 w-10 text-blue-500" />;
      case "thesis":
        return <File className="h-10 w-10 text-purple-500" />;
      case "presentation":
        return <File className="h-10 w-10 text-amber-500" />;
      default:
        return <File className="h-10 w-10 text-gray-400" />;
    }
  };

  return (
    <div className={`
      border rounded-lg shadow-sm hover:shadow-md transition-shadow 
      overflow-hidden flex flex-col
      ${isSelected ? 'ring-2 ring-teal-500 border-teal-500' : 'border-gray-200'}
    `}>
      <div className="p-4 flex-grow flex flex-col">
        <div className="flex items-start justify-between">
          <div className="flex items-center">
            <input
              type="checkbox"
              className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded custom-checkbox mr-3"
              checked={isSelected}
              onChange={() => onSelect(project.id)}
              onClick={(e) => e.stopPropagation()}
            />
            {getProjectIcon()}
          </div>
          <button className="text-gray-400 hover:text-gray-500">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
        
        <div className="mt-3">
          <Link 
            href={`/editor/${project.id}`} 
            className="text-gray-900 hover:text-teal-600 font-medium text-lg line-clamp-2"
          >
            {project.title}
          </Link>
          <p className="text-sm text-gray-500 mt-1">
            Last modified: {formattedDate}
          </p>
        </div>
        
        {project.tags && project.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {project.tags.map((tag, i) => (
              <span
                key={i}
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium tag-badge ${getTagColor(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      
      <div className="border-t border-gray-200 py-2 px-4 bg-gray-50 flex justify-between">
        <button className="text-gray-500 hover:text-teal-600 p-1" title="Download">
          <Download className="h-4 w-4" />
        </button>
        <button className="text-gray-500 hover:text-teal-600 p-1" title="Share">
          <Share2 className="h-4 w-4" />
        </button>
        <button className="text-gray-500 hover:text-teal-600 p-1" title="Copy">
          <Copy className="h-4 w-4" />
        </button>
        <Link 
          href={`/editor/${project.id}`}
          className="text-xs text-teal-600 hover:text-teal-700 font-medium p-1"
        >
          Open
        </Link>
      </div>
    </div>
  );
}