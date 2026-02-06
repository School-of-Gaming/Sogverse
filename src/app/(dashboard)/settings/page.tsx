"use client";

import { useState } from "react";
import { User, Lock, Bell, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useAuth } from "@/providers";
import { useUpdateProfile } from "@/services/users";
import { getClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const updateProfile = useUpdateProfile();

  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);

  const handleSaveProfile = async () => {
    if (!user) return;

    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await updateProfile.mutateAsync({
        userId: user.id,
        updates: { display_name: displayName },
      });
      await refreshProfile();
      setSuccessMessage("Profile updated successfully!");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : "Failed to update profile";
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    const email = profile?.email;
    if (!email) return;

    setPasswordResetLoading(true);
    setPasswordResetError(null);

    try {
      const supabase = getClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
      });

      if (error) {
        setPasswordResetError(error.message);
        return;
      }

      setPasswordResetSent(true);
    } catch {
      setPasswordResetError("An unexpected error occurred");
    } finally {
      setPasswordResetLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <CardTitle>Profile</CardTitle>
          </div>
          <CardDescription>
            Update your personal information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <Identicon id={profile?.id || user?.id || ""} size={64} />
            </Avatar>
            <div>
              <p className="font-medium">
                {profile?.display_name || profile?.username || "User"}
              </p>
              <p className="text-sm text-muted-foreground">
                {profile?.email || `@${profile?.username}`}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {profile?.role} account
              </p>
            </div>
          </div>

          {successMessage && (
            <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-500">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={profile?.email || ""}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed
            </p>
          </div>

          {profile?.username && (
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={profile.username}
                disabled
                className="bg-muted"
              />
            </div>
          )}

          <Button onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>
            Manage your password and security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {passwordResetSent ? (
            <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-500">
              Check your email for a password reset link.
            </div>
          ) : (
            <>
              {passwordResetError && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {passwordResetError}
                </div>
              )}
              <Button
                variant="outline"
                onClick={handleChangePassword}
                disabled={passwordResetLoading}
              >
                {passwordResetLoading ? "Sending..." : "Change Password"}
              </Button>
              <p className="text-sm text-muted-foreground">
                You will receive an email with instructions to reset your password.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Notifications Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure your notification preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Notification settings coming soon.
          </p>
        </CardContent>
      </Card>

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            <CardTitle>Appearance</CardTitle>
          </div>
          <CardDescription>
            Customize how Sogverse looks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Theme settings coming soon. Currently using dark theme.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
