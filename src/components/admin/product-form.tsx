"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent } from "@/components/ui/card";
import { useGames, useCreateGame } from "@/services/games";
import { useCurrency } from "@/hooks/use-currency";
import { tokensToCurrencyDisplay } from "@/lib/constants/tokens";
import { cn, DAYS_OF_WEEK } from "@/lib/utils";

const productSchema = z.object({
  name: z
    .string()
    .min(1, "Product name is required")
    .max(100, "Product name must be at most 100 characters"),
  description: z.string().min(1, "Description is required"),
  tokenCost: z
    .number({ invalid_type_error: "Sorg cost must be a number" })
    .int("Sorg cost must be a whole number")
    .min(1, "Sorg cost must be at least 1"),
  imageUrl: z.string().url("Must be a valid URL"),
  gameId: z.string().uuid("Game is required"),
  dayOfWeek: z.number().int().min(0).max(6),
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored, fixed-length pattern; no ReDoS risk
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Must be a valid time"),
  durationMinutes: z.number().int().min(1, "Duration must be at least 1 minute"),
  minAge: z.number().int().min(0, "Min age must be 0 or greater"),
  maxAge: z.number().int().min(0, "Max age must be 0 or greater"),
}).refine((data) => data.maxAge >= data.minAge, {
  message: "Max age must be greater than or equal to min age",
  path: ["maxAge"],
});

export interface ProductFormValues {
  name: string;
  description: string;
  token_cost: number;
  image_url: string;
  game_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  min_age: number;
  max_age: number;
}

interface ProductFormProps {
  initialValues?: Partial<ProductFormValues>;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  isPending: boolean;
  submitLabel: string;
  pendingLabel: string;
}

export function ProductForm({ initialValues, onSubmit, isPending, submitLabel, pendingLabel }: ProductFormProps) {
  const { data: games, isLoading: gamesLoading } = useGames();
  const createGame = useCreateGame();
  const { currency, locale } = useCurrency();

  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [tokenCost, setTokenCost] = useState(initialValues?.token_cost != null ? String(initialValues.token_cost) : "");
  const [imageUrl, setImageUrl] = useState(initialValues?.image_url ?? "");
  const [gameId, setGameId] = useState(initialValues?.game_id ?? "");
  const [newGameName, setNewGameName] = useState("");
  const [showNewGame, setShowNewGame] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(String(initialValues?.day_of_week ?? 0));
  const [startTime, setStartTime] = useState(initialValues?.start_time ?? "16:00");
  const [durationMinutes, setDurationMinutes] = useState(String(initialValues?.duration_minutes ?? 60));
  const [minAge, setMinAge] = useState(String(initialValues?.min_age ?? 7));
  const [maxAge, setMaxAge] = useState(String(initialValues?.max_age ?? 12));
  const [error, setError] = useState<string | null>(null);

  // Debounced image preview
  const [previewUrl, setPreviewUrl] = useState(initialValues?.image_url ?? "");
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewError(false);
      try {
        if (imageUrl) {
          new URL(imageUrl);
          setPreviewUrl(imageUrl);
        } else {
          setPreviewUrl("");
        }
      } catch {
        setPreviewUrl("");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [imageUrl]);

  const handleCreateGame = async () => {
    if (!newGameName.trim()) return;
    try {
      const game = await createGame.mutateAsync(newGameName.trim());
      setGameId(game.id);
      setNewGameName("");
      setShowNewGame(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const validatedData = productSchema.parse({
        name,
        description,
        tokenCost: tokenCost === "" ? undefined : Number(tokenCost),
        imageUrl,
        gameId,
        dayOfWeek: Number(dayOfWeek),
        startTime,
        durationMinutes: durationMinutes === "" ? undefined : Number(durationMinutes),
        minAge: minAge === "" ? undefined : Number(minAge),
        maxAge: maxAge === "" ? undefined : Number(maxAge),
      });

      await onSubmit({
        name: validatedData.name,
        description: validatedData.description,
        token_cost: validatedData.tokenCost,
        image_url: validatedData.imageUrl,
        game_id: validatedData.gameId,
        day_of_week: validatedData.dayOfWeek,
        start_time: validatedData.startTime,
        duration_minutes: validatedData.durationMinutes,
        min_age: validatedData.minAge,
        max_age: validatedData.maxAge,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "object" && err !== null && "message" in err) {
        setError((err as { message: string }).message);
      } else {
        setError("An unexpected error occurred");
      }
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
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            type="text"
            placeholder="Product name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            placeholder="Describe your product"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending}
            rows={3}
            required
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tokenCost">Sorg Cost (per session)</Label>
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
            ≈ {tokensToCurrencyDisplay(Number(tokenCost) || 0, currency, locale)} per session
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="imageUrl">Image URL</Label>
          <Input
            id="imageUrl"
            type="url"
            placeholder="https://example.com/image.png"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            disabled={isPending}
            required
          />
          {previewUrl && !previewError && (
            <div className="relative mt-2 h-32 w-full overflow-hidden rounded-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Preview"
                className="h-full w-full object-contain"
                onError={() => setPreviewError(true)}
              />
            </div>
          )}
          {previewError && (
            <p className="text-xs text-muted-foreground">Could not load image preview</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="gameId">Game</Label>
          {showNewGame ? (
            <div className="flex gap-2">
              <Input
                placeholder="New game name"
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
                {createGame.isPending ? "..." : "Add"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowNewGame(false)}
              >
                Cancel
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
                <option value="">Select a game...</option>
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
                title="Add new game"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Day of Week</Label>
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
          <Label htmlFor="startTime">Start Time</Label>
          <Input
            id="startTime"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={isPending}
            required
          />
          <p className="text-xs text-muted-foreground">
            Enter time in Finland time (Europe/Helsinki). Customers will see this in their local timezone.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="durationMinutes">Duration (minutes)</Label>
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
            <Label htmlFor="minAge">Min Age</Label>
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
            <Label htmlFor="maxAge">Max Age</Label>
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
          disabled={isPending}
        >
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </CardContent>
    </form>
  );
}
