// Using generic type to avoid version-specific Supabase type incompatibilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

/** Enrolled gamer fields from the get_product_groups_with_details RPC (admin). */
export interface GroupGamer {
  gamerId: string;
  displayName: string;
  enrollmentId: string;
  dateOfBirth: string;
  gender: string;
}

export interface ProductGroup {
  groupId: string;
  productId: string;
  geduId: string;
  displayOrder: number;
  geduDisplayName: string;
  geduEmail: string;
  gamers: GroupGamer[];
}

/** Enrolled gamer fields from the get_gedu_groups RPC (gedu). */
export interface GeduGroupGamer {
  gamerId: string;
  displayName: string;
  enrollmentId: string;
  dateOfBirth: string;
  gender: string;
}

export interface GeduGroup {
  groupId: string;
  productId: string;
  productName: string;
  productDescription: string;
  productImageUrl: string | null;
  productPadletUrl: string | null;
  productMinAge: number;
  productMaxAge: number;
  gameId: string;
  gameName: string;
  geduName: string;
  dayOfWeek: number;
  startTime: string;
  timezone: string;
  durationMinutes: number;
  displayOrder: number;
  gamers: GeduGroupGamer[];
}

export interface BatchGroupChanges {
  addedGroups: Array<{ tempId: string; geduId: string }>;
  updatedGroups: Array<{ groupId: string; geduId: string }>;
  deletedGroupIds: string[];
  enrollmentMoves: Array<{ gamerId: string; fromGroupId: string; toGroupId: string }>;
}

export class GroupsService {
  constructor(private supabase: SupabaseClientType) {}

  async getProductGroups(productId: string): Promise<ProductGroup[]> {
    const { data, error } = await this.supabase.rpc(
      "get_product_groups_with_details",
      { p_product_id: productId },
    );

    if (error) throw error;

    // Reshape flat rows into nested groups
    const groupMap = new Map<string, ProductGroup>();

    for (const row of data || []) {
      if (!groupMap.has(row.group_id)) {
        groupMap.set(row.group_id, {
          groupId: row.group_id,
          productId: row.product_id,
          geduId: row.gedu_id,
          displayOrder: row.display_order,
          geduDisplayName: row.gedu_display_name,
          geduEmail: row.gedu_email,
          gamers: [],
        });
      }

      // gamer fields are null for groups with no enrollments (LEFT JOIN).
      // See ProductGroupWithDetails in @/types for the corrected type.
      if (row.gamer_id) {
        groupMap.get(row.group_id)!.gamers.push({
          gamerId: row.gamer_id,
          displayName: row.gamer_display_name,
          enrollmentId: row.enrollment_id,
          dateOfBirth: row.gamer_date_of_birth,
          gender: row.gamer_gender,
        });
      }
    }

    return Array.from(groupMap.values()).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );
  }

  async getGeduGroups(): Promise<GeduGroup[]> {
    const { data, error } = await this.supabase.rpc("get_gedu_groups");

    if (error) throw error;

    const groupMap = new Map<string, GeduGroup>();

    for (const row of data || []) {
      if (!groupMap.has(row.group_id)) {
        groupMap.set(row.group_id, {
          groupId: row.group_id,
          productId: row.product_id,
          productName: row.product_name,
          productDescription: row.product_description,
          productImageUrl: row.product_image_url,
          productPadletUrl: row.product_padlet_url,
          productMinAge: row.product_min_age,
          productMaxAge: row.product_max_age,
          gameId: row.game_id,
          gameName: row.game_name,
          geduName: row.gedu_display_name,
          dayOfWeek: row.day_of_week,
          startTime: row.start_time,
          timezone: row.timezone,
          durationMinutes: row.duration_minutes,
          displayOrder: row.display_order,
          gamers: [],
        });
      }

      if (row.gamer_id) {
        groupMap.get(row.group_id)!.gamers.push({
          gamerId: row.gamer_id,
          displayName: row.gamer_display_name,
          enrollmentId: row.enrollment_id,
          dateOfBirth: row.gamer_date_of_birth,
          gender: row.gamer_gender,
        });
      }
    }

    return Array.from(groupMap.values()).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );
  }

  async commitGroupChanges(
    productId: string,
    changes: BatchGroupChanges,
  ): Promise<ProductGroup[]> {
    const response = await fetch(`/api/admin/products/${productId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to commit group changes");
    }

    const { groups } = await response.json();
    return groups;
  }
}
