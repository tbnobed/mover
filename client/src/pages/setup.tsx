import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Palette, Server, User } from "lucide-react";

interface SetupPageProps {
  onComplete: () => void;
}

export default function SetupPage({ onComplete }: SetupPageProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [adminData, setAdminData] = useState({
    username: "",
    displayName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const createAdminMutation = useMutation({
    mutationFn: async () => {
      if (adminData.password !== adminData.confirmPassword) {
        throw new Error("Passwords do not match");
      }
      return apiRequest("POST", "/api/bootstrap", {
        username: adminData.username,
        displayName: adminData.displayName,
        email: adminData.email,
        password: adminData.password
      });
    },
    onSuccess: () => {
      toast({ title: "Admin account created" });
      onComplete();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-primary flex items-center justify-center">
            <Palette className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Color Routing System</CardTitle>
          <CardDescription>Initial Setup</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <User className="w-4 h-4" />
            </div>
            <div className={`h-0.5 w-12 ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <Server className="w-4 h-4" />
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Create your administrator account
              </p>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={adminData.username}
                  onChange={(e) => setAdminData({ ...adminData, username: e.target.value })}
                  placeholder="admin"
                  data-testid="input-setup-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={adminData.displayName}
                  onChange={(e) => setAdminData({ ...adminData, displayName: e.target.value })}
                  placeholder="System Administrator"
                  data-testid="input-setup-displayname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={adminData.email}
                  onChange={(e) => setAdminData({ ...adminData, email: e.target.value })}
                  placeholder="admin@example.com"
                  data-testid="input-setup-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={adminData.password}
                  onChange={(e) => setAdminData({ ...adminData, password: e.target.value })}
                  data-testid="input-setup-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={adminData.confirmPassword}
                  onChange={(e) => setAdminData({ ...adminData, confirmPassword: e.target.value })}
                  data-testid="input-setup-confirm-password"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => createAdminMutation.mutate()}
                disabled={!adminData.username || !adminData.displayName || !adminData.password || createAdminMutation.isPending}
                data-testid="button-create-admin"
              >
                {createAdminMutation.isPending ? "Creating..." : "Create Admin Account"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
