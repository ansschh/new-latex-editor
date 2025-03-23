// hooks/useProjects.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  getDocs 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authenticateWithFirebase } from "@/lib/firebase-auth";
import { User } from "firebase/auth";

interface Project {
  id: string;
  title: string;
  owner: string;
  lastModified: {
    seconds: number;
    nanoseconds: number;
  };
  content: string;
  tags: string[];
  type: string;
  collaborators: string[];
  isPublic: boolean;
  [key: string]: any;
}

export function useProjects(clerkUserId: string) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
    
    // New state to track data initialization
    const [dataInitialized, setDataInitialized] = useState<boolean>(false);
  
    // Authenticate with Firebase first
    useEffect(() => {
      let isMounted = true;
      
      async function authenticate() {
        if (!clerkUserId) {
          if (isMounted) {
            setFirebaseUser(null);
            setLoading(false);
          }
          return;
        }
        
        try {
          const fbUser = await authenticateWithFirebase(clerkUserId);
          if (isMounted) {
            setFirebaseUser(fbUser);
          }
        } catch (err: any) {
          console.error("Failed to authenticate with Firebase:", err);
          if (isMounted) {
            setError(err.message);
            setLoading(false);
          }
        }
      }
      
      authenticate();
      
      return () => {
        isMounted = false;
      };
    }, [clerkUserId]);
  
    // Only fetch projects after authentication
    useEffect(() => {
      let isMounted = true;
      let unsubscribe: () => void = () => {};
      
      if (!clerkUserId || !firebaseUser) {
        return () => {};
      }
  
      if (isMounted) {
        setLoading(true);
      }
      
      try {
        console.log("Fetching projects for user ID:", clerkUserId);
        
        const projectsRef = collection(db, "projects");
        const projectsQuery = query(
          projectsRef,
          where("owner", "==", clerkUserId)
        );
  
        unsubscribe = onSnapshot(
          projectsQuery,
          (querySnapshot) => {
            if (isMounted) {
              const projectsList: Project[] = [];
              querySnapshot.forEach((doc) => {
                projectsList.push({
                  id: doc.id,
                  ...doc.data() as Omit<Project, 'id'>
                });
              });
              
              projectsList.sort((a, b) => {
                const aTime = a.lastModified?.seconds || 0;
                const bTime = b.lastModified?.seconds || 0;
                return bTime - aTime;
              });
              
              console.log("Projects fetched successfully:", projectsList.length);
              setProjects(projectsList);
              setLoading(false);
              setDataInitialized(true);
            }
          },
          (err: any) => {
            console.error("Error fetching projects:", err);
            if (isMounted) {
              setError(err.message);
              setLoading(false);
              setDataInitialized(true);
            }
          }
        );
  
        return () => {
          unsubscribe();
        };
      } catch (err: any) {
        console.error("Error setting up projects listener:", err);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
          setDataInitialized(true);
        }
        return () => {};
      }
    }, [clerkUserId, firebaseUser]);
  
    // Function to manually refresh
    const refreshProjects = useCallback(() => {
      if (firebaseUser && clerkUserId) {
        setLoading(true);
        
        // Small delay before setting loading to false if nothing changes
        setTimeout(() => {
          setLoading(false);
        }, 1000);
      }
    }, [firebaseUser, clerkUserId]);
  
    return {
      projects,
      loading,
      error,
      refreshProjects,
      firebaseAuth: !!firebaseUser,
      dataInitialized
    };
  }