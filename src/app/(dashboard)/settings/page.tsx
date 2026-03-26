"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, Bell, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { MinecraftUsernameField } from "@/components/minecraft/minecraft-username-field";
import { DISPLAY_NAME_MAX } from "@/lib/constants";
import { useAuth } from "@/providers";
import { useUpdateProfile } from "@/services/users";
import { useMyMinecraftAccount, useUpdateMyMinecraft } from "@/services/minecraft";

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const updateProfile = useUpdateProfile();
  const router = useRouter();
  const showMinecraft = profile?.role === "gamer" || profile?.role === "gedu";
  const { data: mcAccount } = useMyMinecraftAccount();
  const updateMyMc = useUpdateMyMinecraft();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Minecraft state (gamers and gedus)
  const [minecraftUsername, setMinecraftUsername] = useState("");
  const [mcInitialized, setMcInitialized] = useState(false);
  const [isSavingMc, setIsSavingMc] = useState(false);
  const [mcSuccess, setMcSuccess] = useState<string | null>(null);
  const [mcError, setMcError] = useState<string | null>(null);

  // Initialize minecraft username once account data loads
  if (mcAccount !== undefined && !mcInitialized) {
    setMinecraftUsername(mcAccount?.minecraft_username ?? "");
    setMcInitialized(true);
  }
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

  const handleChangePassword = () => {
    router.push("/reset-password");
  };

  const handleSaveMc = async () => {
    setIsSavingMc(true);
    setMcSuccess(null);
    setMcError(null);

    try {
      const mcValue = minecraftUsername.trim() || null;
      await updateMyMc.mutateAsync(mcValue);
      setMcSuccess(
        mcValue
          ? "Minecraft username saved!"
          : "Minecraft username cleared.",
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : "Failed to update Minecraft username";
      setMcError(message);
    } finally {
      setIsSavingMc(false);
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
              <Identicon id={profile?.id || user?.id || ""} size={64} />
            </Avatar>
            <div>
              <p className="font-medium">
                {profile?.display_name}
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
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
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
              maxLength={DISPLAY_NAME_MAX}
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={profile?.email || ""}
              disabled
              className="bg-muted"
            />
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
        <CardContent>
          <Button
            variant="outline"
            onClick={handleChangePassword}
          >
            Change Password
          </Button>
        </CardContent>
      </Card>

      {/* Minecraft Account (gamers and gedus) */}
      {showMinecraft && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gamepad2 className="h-5 w-5" />
              <CardTitle>Minecraft Account</CardTitle>
            </div>
            <CardDescription>
              Link your Minecraft Java username
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {mcSuccess && (
              <div className="rounded-md bg-success/10 p-3 text-sm text-success">
                {mcSuccess}
              </div>
            )}

            {mcError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {mcError}
              </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); handleSaveMc(); }} className="space-y-6">
              <MinecraftUsernameField
                value={minecraftUsername}
                onChange={setMinecraftUsername}
                disabled={isSavingMc}
              />

              <Button
                type="submit"
                disabled={isSavingMc}
              >
                {isSavingMc ? "Saving..." : "Save Minecraft Username"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
