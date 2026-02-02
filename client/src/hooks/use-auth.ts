import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

export const PERMISSIONS = {
  VIEW_FILES: "view_files",
  VIEW_AUDIT: "view_audit",
  VALIDATE_FILES: "validate_files",
  ASSIGN_COLORIST: "assign_colorist",
  START_WORK: "start_work",
  DELIVER_MAM: "deliver_mam",
  REJECT_FILES: "reject_files",
  ARCHIVE_FILES: "archive_files",
  REVERT_STATE: "revert_state",
  TRIGGER_CLEANUP: "trigger_cleanup",
  TRIGGER_RETRANSFER: "trigger_retransfer",
  DELETE_FILES: "delete_files",
  MANAGE_USERS: "manage_users",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: string;
  email?: string;
  permissions?: Permission[];
}

export function useAuth() {
  const { data: user, isLoading, error, refetch } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const isAuthenticated = !!user && !error;
  
  const hasPermission = (permission: Permission): boolean => {
    if (!user?.permissions) return false;
    return user.permissions.includes(permission);
  };

  return {
    user,
    isLoading,
    isAuthenticated,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    refetch,
    hasPermission,
    permissions: user?.permissions || [],
  };
}
