import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getAvatarUrl } from "@/lib/storage";
import { useQueryClient } from "@tanstack/react-query";

type UserRole = "admin" | "creator" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole;
  profileId: string | null;
  avatarUrl: string | null;
  fullName: string | null;
  isMentor: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [isMentor, setIsMentor] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Track if we're in the middle of signing out to prevent race conditions
  const isSigningOutRef = useRef(false);
  // Prevent duplicate profile fetches when auth events fire in quick succession
  const profileFetchInFlightRef = useRef<string | null>(null);
  
  // Get query client to clear cache on sign out
  const queryClient = useQueryClient();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Skip processing if we're signing out - we'll handle state clearing manually
        if (isSigningOutRef.current) {
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer role and profile fetching
        if (session?.user) {
          setTimeout(() => {
            // Double-check we're not signing out before fetching
            if (!isSigningOutRef.current) {
              fetchUserRoleAndProfile(session.user.id);
            }
          }, 0);
        } else {
          setRole(null);
          setProfileId(null);
      setAvatarUrl(null);
      setFullName(null);
      setIsMentor(false);
      setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRoleAndProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchUserRoleAndProfile(userId: string) {
    if (isSigningOutRef.current) return;
    if (profileFetchInFlightRef.current === userId) return;

    profileFetchInFlightRef.current = userId;

    try {
      // Fetch role AND profile in parallel
      const [{ data: roleData }, { data: profileData }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).single(),
        supabase.from("profiles").select("id, avatar_url, full_name, is_mentor").eq("user_id", userId).single(),
      ]);
      
      if (isSigningOutRef.current) return;
      
      setRole(roleData?.role as UserRole ?? null);
      setProfileId(profileData?.id ?? null);
      setAvatarUrl(getAvatarUrl(profileData?.avatar_url));
      setFullName(profileData?.full_name ?? null);
      setIsMentor(profileData?.is_mentor ?? false);
    } catch (error) {
      console.error("Error fetching user role/profile:", error);
    } finally {
      profileFetchInFlightRef.current = null;
      if (!isSigningOutRef.current) {
        setLoading(false);
      }
    }
  }

  async function refreshProfile() {
    if (user?.id) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, avatar_url, full_name")
        .eq("user_id", user.id)
        .single();
      
      setAvatarUrl(getAvatarUrl(profileData?.avatar_url));
      setFullName(profileData?.full_name ?? null);
    }
  }

  async function signOut() {
    // Set flag to prevent race conditions with onAuthStateChange
    isSigningOutRef.current = true;
    
    // Set loading state to show spinner during transition
    setLoading(true);
    
    try {
      // Clear all React Query cache to prevent stale data
      queryClient.clear();
      
      // Clear localStorage BEFORE attempting Supabase signout
      // This ensures cleanup happens even if signout fails
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.startsWith('sb-') || key.includes('supabase')
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear any auth-related cookies for cross-browser support (Safari, etc.)
      document.cookie.split(";").forEach((c) => {
        const eqPos = c.indexOf("=");
        const name = eqPos > -1 ? c.substring(0, eqPos).trim() : c.trim();
        if (name.startsWith('sb-') || name.includes('supabase')) {
          document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        }
      });
      
      // Try to sign out from Supabase, but don't let errors block cleanup
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (signOutError) {
        // Session might already be invalidated - this is OK
        console.log("Sign out completed (session may have been expired)");
      }
      
      // Clear all local state regardless of signout result
      setUser(null);
      setSession(null);
      setRole(null);
      setProfileId(null);
      setAvatarUrl(null);
      setFullName(null);
      setIsMentor(false);
    } finally {
      profileFetchInFlightRef.current = null;
      // Reset the signing out flag after a longer delay
      // This gives time for storage to fully clear before any new session check
      setTimeout(() => {
        isSigningOutRef.current = false;
        setLoading(false);
      }, 300);
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, role, profileId, avatarUrl, fullName, isMentor, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
