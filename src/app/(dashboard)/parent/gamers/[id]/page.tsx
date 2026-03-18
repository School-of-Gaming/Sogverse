"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, Lock, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { MinecraftUsernameField } from "@/components/minecraft/minecraft-username-field";
import { useMyGamers, useUpdateGamer, useGamerProfile } from "@/services/gamers";
import { ROUTES, DISPLAY_NAME_MAX } from "@/lib/constants";

export default function GamerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: gamers, isLoading } = useMyGamers();
  const { data: gamerProfile } = useGamerProfile(id);
  const updateGamer = useUpdateGamer();

  const gamer = gamers?.find((g) => g.id === id);

  // Profile form state
  const [displayName, setDisplayName] = useState("");
  const [profileInitialized, setProfileInitialized] = useState(false);

  // Minecraft form state
  const [minecraftUsername, setMinecraftUsername] = useState("");
  const [mcInitialized, setMcInitialized] = useState(false);
  const [isSavingMc, setIsSavingMc] = useState(false);
  const [mcSuccess, setMcSuccess] = useState<string | null>(null);
  const [mcError, setMcError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Initialize display name once gamer data loads
  if (gamer && !profileInitialized) {
    setDisplayName(gamer.display_name);
    setProfileInitialized(true);
  }

  // Initialize minecraft username once gamer profile loads
  if (gamerProfile && !mcInitialized) {
    setMinecraftUsername(gamerProfile.minecraft_username ?? "");
    setMcInitialized(true);
  }

  const handleSaveProfile = async () => {
    if (!gamer) return;

    setIsSavingProfile(true);
    setProfileSuccess(null);
    setProfileError(null);

    try {
      await updateGamer.mutateAsync({
        gamerId: gamer.id,
        updates: { displayName: displayName.trim() },
      });
      setProfileSuccess("Display name updated!");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : "Failed to update display name";
      setProfileError(message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!gamer) return;

    setPasswordSuccess(null);
    setPasswordError(null);

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setIsSavingPassword(true);

    try {
      await updateGamer.mutateAsync({
        gamerId: gamer.id,
        updates: { password: newPassword },
      });
      setPasswordSuccess("Password updated!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : "Failed to update password";
      setPasswordError(message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSaveMc = async () => {
    if (!gamer) return;

    setIsSavingMc(true);
    setMcSuccess(null);
    setMcError(null);

    try {
      const mcValue = minecraftUsername.trim() || null;
      await updateGamer.mutateAsync({
        gamerId: gamer.id,
        updates: { minecraftUsername: mcValue },
      });
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

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <Card className="animate-pulse">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-md bg-muted" />
              <div className="space-y-2">
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="h-4 w-24 rounded bg-muted" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-10 w-full rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!gamer) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={ROUTES.customer.gamers}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to My Gamers
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-medium">Gamer Not Found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This gamer account could not be found.
            </p>
            <Link href={ROUTES.customer.gamers} className="mt-4">
              <Button variant="outline">Back to My Gamers</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={ROUTES.customer.gamers}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Gamers
      </Link>

      <div>
        <h1 className="text-3xl font-bold">Manage Gamer</h1>
        <p className="text-muted-foreground">
          Update {gamer.display_name}&apos;s account settings
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
            Update this gamer&apos;s display name
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <Identicon id={gamer.id} size={64} />
            </Avatar>
            <div>
              <p className="font-medium">{gamer.display_name}</p>
              <p className="text-sm text-muted-foreground">
                @{gamer.username}
              </p>
            </div>
          </div>

          {profileSuccess && (
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              {profileSuccess}
            </div>
          )}

          {profileError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {profileError}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="gamerDisplayName">Display Name</Label>
              <Input
                id="gamerDisplayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                maxLength={DISPLAY_NAME_MAX}
              />
            </div>

            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={gamer.username}
                disabled
                className="bg-muted"
              />
            </div>

            <Button
              type="submit"
              disabled={isSavingProfile || displayName.trim().length < 2}
            >
              {isSavingProfile ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Minecraft Account */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5" />
            <CardTitle>Minecraft Account</CardTitle>
          </div>
          <CardDescription>
            Link this gamer&apos;s Minecraft Java username
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

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>
            Change this gamer&apos;s login password
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {passwordSuccess && (
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              {passwordSuccess}
            </div>
          )}

          {passwordError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {passwordError}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }} className="space-y-6">
            <input type="text" name="username" autoComplete="username" value={gamer.username} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              disabled={isSavingPassword || !newPassword}
              variant="outline"
            >
              {isSavingPassword ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
