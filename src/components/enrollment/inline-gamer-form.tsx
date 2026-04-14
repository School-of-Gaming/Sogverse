"use client";

import { useState } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MinecraftUsernameField } from "@/components/minecraft/minecraft-username-field";
import { useAuth } from "@/providers";
import { useCreateGamer } from "@/services/gamers";
import { computeAge } from "@/lib/utils";

const gamerSchema = z
  .object({
    displayName: z.string().min(2, "Display name must be at least 2 characters"),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(20, "Username must be at most 20 characters")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores",
      ),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
    dateOfBirth: z
      .string()
      .min(1, "Date of birth is required")
      .refine(
        (val) => new Date(val + "T00:00:00") <= new Date(),
        "Date of birth cannot be in the future",
      ),
    gender: z.enum(["boy", "girl", "non_binary"], {
      required_error: "Gender is required",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

function computeAgeFromInput(dateOfBirth: string): number | null {
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const age = computeAge(dateOfBirth);
  return age >= 0 ? age : null;
}

interface InlineGamerFormProps {
  onSuccess: (gamerId: string, displayName: string) => void;
  onCancel: () => void;
}

export function InlineGamerForm({ onSuccess, onCancel }: InlineGamerFormProps) {
  const t = useTranslations('enrollment');
  const c = useTranslations('common');
  const { user } = useAuth();
  const createGamer = useCreateGamer();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 10);
    return d.toISOString().split("T")[0];
  });
  const [gender, setGender] = useState<"boy" | "girl" | "non_binary" | "">("");
  const [minecraftUsername, setMinecraftUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const age = computeAgeFromInput(dateOfBirth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const validated = gamerSchema.parse({
        displayName,
        username,
        password,
        confirmPassword,
        dateOfBirth,
        gender,
      });

      if (!user) {
        setError(t('gamerForm.mustBeLoggedIn'));
        return;
      }

      const result = await createGamer.mutateAsync({
        parentId: user.id,
        input: {
          username: validated.username,
          password: validated.password,
          displayName: validated.displayName,
          dateOfBirth: validated.dateOfBirth,
          gender: validated.gender,
          minecraftUsername: minecraftUsername.trim() || undefined,
        },
      });

      onSuccess(result.gamer.id, validated.displayName);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(c('unexpectedError'));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Alert variant="info">
        <Info className="h-4 w-4 shrink-0" />
        <div>
          <AlertTitle>{t('gamerForm.credentialsAlertTitle')}</AlertTitle>
          <AlertDescription>
            {t('gamerForm.credentialsAlertDescription')}
          </AlertDescription>
        </div>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="gamer-displayName">{t('gamerForm.displayNameLabel')}</Label>
        <Input
          id="gamer-displayName"
          type="text"
          placeholder={t('gamerForm.displayNamePlaceholder')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={createGamer.isPending}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gamer-username">{c('username')}</Label>
        <Input
          id="gamer-username"
          type="text"
          placeholder={t('gamerForm.usernamePlaceholder')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={createGamer.isPending}
          required
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          {t('gamerForm.usernameHint')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gamer-password">{c('password')}</Label>
        <div className="relative">
          <Input
            id="gamer-password"
            type={showPassword ? "text" : "password"}
            placeholder={t('gamerForm.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={createGamer.isPending}
            required
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t('gamerForm.passwordHint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gamer-confirmPassword">{c('confirmPassword')}</Label>
        <Input
          id="gamer-confirmPassword"
          type={showPassword ? "text" : "password"}
          placeholder={t('gamerForm.confirmPasswordPlaceholder')}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={createGamer.isPending}
          required
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gamer-dob">{t('gamerForm.dateOfBirthLabel')}</Label>
        <Input
          id="gamer-dob"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          max={new Date().toISOString().split("T")[0]}
          disabled={createGamer.isPending}
          required
        />
        {age !== null && (
          <p className="text-sm font-medium text-primary">
            {t('gamerForm.age', { age, count: age })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t('gamerForm.genderLabel')}</Label>
        <div className="flex gap-2">
          {(
            /* eslint-disable i18next/no-literal-string -- "boy"/"girl"/"non_binary" are DB enum values, not user-facing text; the labels are already translated */
            [
              { value: "boy", label: t('gamerForm.genderBoy') },
              { value: "girl", label: t('gamerForm.genderGirl') },
              { value: "non_binary", label: t('gamerForm.genderNonBinary') },
            ] as const
            /* eslint-enable i18next/no-literal-string -- end of DB enum values block */
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGender(option.value)}
              disabled={createGamer.isPending}
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                gender === option.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <MinecraftUsernameField
        value={minecraftUsername}
        onChange={setMinecraftUsername}
        disabled={createGamer.isPending}
        optional
      />

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={createGamer.isPending}
          className="flex-1"
        >
          {c('cancel')}
        </Button>
        <Button
          type="submit"
          disabled={createGamer.isPending || !gender}
          className="flex-1"
        >
          {createGamer.isPending ? t('gamerForm.creating') : t('gamerForm.createGamer')}
        </Button>
      </div>
    </form>
  );
}
