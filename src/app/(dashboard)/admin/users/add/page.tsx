"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { SUPPORTED_LANGUAGES, LANGUAGE_CONFIG, DEFAULT_LANGUAGE, type SupportedLanguage } from "@/lib/constants/language-preference";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateGedu } from "@/services/users";

export default function AddUserPage() {
  const t = useTranslations('admin.users');
  const c = useTranslations('common');
  const createGedu = useCreateGedu();

  const createGeduSchema = z.object({
    email: z.string().email(t('invalidEmail')),
  });

  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setWarning(null);

    try {
      const validatedData = createGeduSchema.parse({ email });

      const result = await createGedu.mutateAsync({
        email: validatedData.email,
        language,
      });

      if (result.warning) {
        setWarning(result.warning);
      }

      setSuccess(true);
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

  if (success) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <h3 className="mt-4 text-lg font-medium">{t('inviteSent')}</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {t('inviteSentDescription', { email })}
            </p>
            {warning && (
              <p className="mt-2 text-center text-sm text-warning">
                {warning}
              </p>
            )}
            <div className="mt-6 flex gap-4">
              <Link href={ROUTES.admin.users}>
                <Button variant="outline">{t('viewAllUsers')}</Button>
              </Link>
              <Button onClick={() => {
                setSuccess(false);
                setEmail("");
                setWarning(null);
              }}>
                {t('inviteAnother')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <Link href={ROUTES.admin.users}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('inviteNewGedu')}</h1>
          <p className="text-muted-foreground">
            {t('sendInvitation')}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <UserPlus className="h-6 w-6 text-secondary-foreground" />
            </div>
            <div>
              <CardTitle>{t('newGeduInvitation')}</CardTitle>
              <CardDescription>
                {t('geduReceiveEmail')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t('emailAddress')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={createGedu.isPending}
                required
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">{t('inviteLanguage')}</Label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                disabled={createGedu.isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {LANGUAGE_CONFIG[lang].nativeLabel} ({LANGUAGE_CONFIG[lang].label})
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={createGedu.isPending}
            >
              {createGedu.isPending ? t('sendingInvite') : t('sendInvite')}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
