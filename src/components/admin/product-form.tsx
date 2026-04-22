"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent } from "@/components/ui/card";
import { useGames, useCreateGame } from "@/services/games";
import { useSpokenLanguages } from "@/services/users";
import { useCurrency } from "@/hooks/use-currency";
import { useTokenRates } from "@/providers/token-rate-provider";
import { cn, DAYS_OF_WEEK } from "@/lib/utils";
import { ProductLocationPicker } from "@/components/admin/product-location-picker";
import { ProductImagePicker, type ProductImageValue } from "@/components/admin/product-image-picker";
import { SpokenLanguageRadioGroup } from "@/components/ui/spoken-language-checkboxes";

function createProductSchema(msgs: Record<string, string>) {
  return z.object({
    name: z
      .string()
      .min(1, msgs.nameRequired)
      .max(100, msgs.nameMaxLength),
    description: z.string().min(1, msgs.descriptionRequired),
    tokenCost: z
      .number({ invalid_type_error: msgs.sorgCostNumber })
      .int(msgs.sorgCostWhole)
      .min(1, msgs.sorgCostMin),
    padletUrl: z.union([z.string().url(msgs.validUrl), z.literal("")]).optional(),
    gameId: z.string().uuid(msgs.gameRequired),
    dayOfWeek: z.number().int().min(0).max(6),
    // eslint-disable-next-line security/detect-unsafe-regex -- anchored, fixed-length pattern; no ReDoS risk
    startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, msgs.validTime),
    durationMinutes: z.number().int().min(1, msgs.durationMin),
    minAge: z.number().int().min(0, msgs.minAgeMin),
    maxAge: z.number().int().min(0, msgs.maxAgeMin),
    isRemote: z.boolean(),
    locationId: z.string().uuid().nullable(),
    spokenLanguageCode: z.string().min(1, msgs.spokenLanguageRequired),
  }).refine((data) => data.maxAge >= data.minAge, {
    message: msgs.maxAgeGte,
    path: ["maxAge"],
  }).refine((data) => data.isRemote ? data.locationId === null : data.locationId !== null, {
    message: msgs.locationRequired,
    path: ["locationId"],
  });
}

export interface ProductFormValues {
  name: string;
  description: string;
  token_cost: number;
  padlet_url: string | null;
  game_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  min_age: number;
  max_age: number;
  is_remote: boolean;
  location_id: string | null;
  spoken_language_code: string;
  /**
   * New image to upload. `null` means "keep the existing image" — only valid
   * in edit mode. For create the form enforces a non-null value before
   * calling onSubmit, so the add page can treat this as guaranteed File.
   */
  image: File | null;
}

export interface ProductFormInitialValues extends Partial<Omit<ProductFormValues, "image">> {
  /** Current image path in the bucket, used to seed the preview in edit mode. */
  image_path?: string;
}

interface ProductFormProps {
  initialValues?: ProductFormInitialValues;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  isPending: boolean;
  submitLabel: string;
  pendingLabel: string;
}

export function ProductForm({ initialValues, onSubmit, isPending, submitLabel, pendingLabel }: ProductFormProps) {
  const t = useTranslations('admin.forms');
  const c = useTranslations('common');
  const { data: games, isLoading: gamesLoading } = useGames();
  const createGame = useCreateGame();
  const { data: spokenLanguages } = useSpokenLanguages();
  const { currency } = useCurrency();
  const locale = useLocale();
  const { tokensToCurrencyDisplay } = useTokenRates();
  const validationKeys = [
    "nameRequired", "nameMaxLength", "descriptionRequired", "sorgCostNumber",
    "sorgCostWhole", "sorgCostMin", "validUrl", "imageRequired", "gameRequired",
    "validTime", "durationMin", "minAgeMin", "maxAgeMin", "maxAgeGte",
    "locationRequired", "spokenLanguageRequired",
  ] as const;
  const msgs = Object.fromEntries(validationKeys.map((k) => [k, t(k)]));
  const productSchema = createProductSchema(msgs);

  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [tokenCost, setTokenCost] = useState(initialValues?.token_cost != null ? String(initialValues.token_cost) : "");
  // File when admin staged a new image (not yet uploaded), string when an
  // existing bucket path is loaded (edit mode), null when empty. The File is
  // never uploaded client-side — it's handed to the server along with the
  // rest of the form in a single multipart request, so a failed create /
  // update cannot leave an orphan in the bucket.
  const [imageValue, setImageValue] = useState<ProductImageValue>(
    initialValues?.image_path ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [padletUrl, setPadletUrl] = useState(initialValues?.padlet_url ?? "");
  const [gameId, setGameId] = useState(initialValues?.game_id ?? "");
  const [newGameName, setNewGameName] = useState("");
  const [showNewGame, setShowNewGame] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(String(initialValues?.day_of_week ?? 0));
  const [startTime, setStartTime] = useState(initialValues?.start_time ?? "16:00");
  const [durationMinutes, setDurationMinutes] = useState(String(initialValues?.duration_minutes ?? 60));
  const [minAge, setMinAge] = useState(String(initialValues?.min_age ?? 7));
  const [maxAge, setMaxAge] = useState(String(initialValues?.max_age ?? 12));
  const [isRemote, setIsRemote] = useState(initialValues?.is_remote ?? true);
  const [locationId, setLocationId] = useState<string | null>(initialValues?.location_id ?? null);
  const [spokenLanguageCode, setSpokenLanguageCode] = useState(
    initialValues?.spoken_language_code ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const handleCreateGame = async () => {
    console.log("[DBG product-form] handleCreateGame:enter", {
      newGameName,
      trimmed: newGameName.trim(),
      gameIdBefore: gameId,
      showNewGame,
    });
    if (!newGameName.trim()) {
      console.log("[DBG product-form] handleCreateGame:abort empty name");
      return;
    }
    try {
      const game = await createGame.mutateAsync(newGameName.trim());
      console.log("[DBG product-form] handleCreateGame:mutateAsync resolved", {
        game,
      });
      setGameId(game.id);
      setNewGameName("");
      setShowNewGame(false);
      console.log("[DBG product-form] handleCreateGame:state updates scheduled", {
        scheduledGameId: game.id,
      });
    } catch (err) {
      console.log("[DBG product-form] handleCreateGame:error", {
        errName: err instanceof Error ? err.name : typeof err,
        errMessage: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : t('failedToCreateGame'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[DBG product-form] handleSubmit:enter", {
      name,
      description: description.slice(0, 40),
      tokenCost,
      gameId,
      gameIdLength: gameId.length,
      showNewGame,
      newGameName,
      createGameIsPending: createGame.isPending,
      dayOfWeek,
      startTime,
      durationMinutes,
      minAge,
      maxAge,
      isRemote,
      locationId,
      spokenLanguageCode,
      imageValueKind:
        imageValue === null
          ? "null"
          : imageValue instanceof File
          ? `File(name=${imageValue.name},size=${imageValue.size},type=${imageValue.type})`
          : `string(${imageValue})`,
      gamesListHas: games?.some((g) => g.id === gameId) ?? null,
      gamesListLength: games?.length ?? null,
    });
    setError(null);

    // Image presence check runs outside zod because File isn't a zod-native
    // type; imageValue is a File (new), a string (existing bucket path in
    // edit mode — treat as "keep current"), or null (error).
    if (!imageValue) {
      console.log("[DBG product-form] handleSubmit:abort no image");
      setError(t('imageRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const validatedData = productSchema.parse({
        name,
        description,
        tokenCost: tokenCost === "" ? undefined : Number(tokenCost),
        padletUrl,
        gameId,
        dayOfWeek: Number(dayOfWeek),
        startTime,
        durationMinutes: durationMinutes === "" ? undefined : Number(durationMinutes),
        minAge: minAge === "" ? undefined : Number(minAge),
        maxAge: maxAge === "" ? undefined : Number(maxAge),
        isRemote,
        locationId,
        spokenLanguageCode,
      });
      console.log("[DBG product-form] handleSubmit:zod passed", {
        gameId: validatedData.gameId,
      });

      await onSubmit({
        name: validatedData.name,
        description: validatedData.description,
        token_cost: validatedData.tokenCost,
        padlet_url: validatedData.padletUrl || null,
        game_id: validatedData.gameId,
        day_of_week: validatedData.dayOfWeek,
        start_time: validatedData.startTime,
        duration_minutes: validatedData.durationMinutes,
        min_age: validatedData.minAge,
        max_age: validatedData.maxAge,
        is_remote: validatedData.isRemote,
        location_id: validatedData.locationId,
        spoken_language_code: validatedData.spokenLanguageCode,
        image: imageValue instanceof File ? imageValue : null,
      });
      console.log("[DBG product-form] handleSubmit:onSubmit resolved");
    } catch (err) {
      console.log("[DBG product-form] handleSubmit:error", {
        isZod: err instanceof z.ZodError,
        zodIssues: err instanceof z.ZodError ? err.errors : undefined,
        errName: err instanceof Error ? err.name : typeof err,
        errMessage: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "object" && err !== null && "message" in err) {
        setError((err as { message: string }).message);
      } else {
        setError(c('unexpectedError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">{t('nameLabel')}</Label>
          <Input
            id="name"
            type="text"
            placeholder={t('namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t('descriptionLabel')}</Label>
          <textarea
            id="description"
            placeholder={t('descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending}
            rows={3}
            required
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="padletUrl">{t('padletUrlLabel')}</Label>
          <Input
            id="padletUrl"
            type="url"
            placeholder="https://padlet.com/..."
            value={padletUrl}
            onChange={(e) => setPadletUrl(e.target.value)}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tokenCost">{t('sorgCostLabel')}</Label>
          <Input
            id="tokenCost"
            type="number"
            step="1"
            min="1"
            placeholder="1"
            value={tokenCost}
            onChange={(e) => setTokenCost(e.target.value)}
            disabled={isPending}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t('approxPerSession', { amount: tokensToCurrencyDisplay(Number(tokenCost) || 0, currency, locale) })}
          </p>
        </div>

        <ProductImagePicker
          value={imageValue}
          onChange={setImageValue}
          disabled={isPending || submitting}
        />

        <div className="space-y-2">
          <Label htmlFor="gameId">{t('gameLabel')}</Label>
          {showNewGame ? (
            <div className="flex gap-2">
              <Input
                placeholder={t('newGameName')}
                value={newGameName}
                onChange={(e) => setNewGameName(e.target.value)}
                disabled={createGame.isPending}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleCreateGame}
                disabled={createGame.isPending || !newGameName.trim()}
              >
                {createGame.isPending ? "..." : t('addButton')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowNewGame(false)}
              >
                {c('cancel')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                id="gameId"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                disabled={isPending || gamesLoading}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">{t('selectGame')}</option>
                {games?.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowNewGame(true)}
                title={t('addNewGame')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <ProductLocationPicker
          isRemote={isRemote}
          locationId={locationId}
          onChange={({ isRemote: nextRemote, locationId: nextId }) => {
            setIsRemote(nextRemote);
            setLocationId(nextId);
          }}
          disabled={isPending}
        />

        <div className="space-y-2">
          <Label>{t('spokenLanguageLabel')}</Label>
          <SpokenLanguageRadioGroup
            spokenLanguages={spokenLanguages ?? []}
            selected={spokenLanguageCode || null}
            onChange={setSpokenLanguageCode}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('dayOfWeekLabel')}</Label>
          <div className="flex rounded-md border border-input">
            {DAYS_OF_WEEK.map((day, i) => (
              <button
                key={i}
                type="button"
                disabled={isPending}
                onClick={() => setDayOfWeek(String(i))}
                className={cn(
                  "flex-1 py-2 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md disabled:cursor-not-allowed disabled:opacity-50",
                  String(i) === dayOfWeek
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="startTime">{t('startTimeLabel')}</Label>
          <Input
            id="startTime"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={isPending}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t('startTimeHint')}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="durationMinutes">{t('durationLabel')}</Label>
          <Input
            id="durationMinutes"
            type="number"
            min="1"
            placeholder="60"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            disabled={isPending}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="minAge">{t('minAgeLabel')}</Label>
            <Input
              id="minAge"
              type="number"
              min="0"
              placeholder="7"
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
              disabled={isPending}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxAge">{t('maxAgeLabel')}</Label>
            <Input
              id="maxAge"
              type="number"
              min="0"
              placeholder="12"
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value)}
              disabled={isPending}
              required
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isPending || submitting}
        >
          {isPending || submitting ? pendingLabel : submitLabel}
        </Button>
      </CardContent>
    </form>
  );
}
