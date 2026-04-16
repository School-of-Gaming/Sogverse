"use client";

import { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  useAllLocations,
  useCreateLocation,
  useUpdateLocation,
} from "@/services/locations";
import {
  LocationTree,
  buildLocationTree,
  filterLocationTree,
} from "@/components/locations/location-tree";
import { LocationFormDialog } from "@/components/admin/location-form-dialog";
import type { LocationFormValues } from "@/components/admin/location-form-dialog";
import type { Location } from "@/types";

export default function AdminLocationsPage() {
  const t = useTranslations('admin.locations');
  const { data: locations, isLoading } = useAllLocations();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();

  const [searchQuery, setSearchQuery] = useState("");

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | undefined>(undefined);
  const [parentLocation, setParentLocation] = useState<Location | null>(null);

  const tree = useMemo(
    () => (locations ? buildLocationTree(locations) : []),
    [locations]
  );

  const filteredTree = useMemo(
    () => filterLocationTree(tree, searchQuery),
    [tree, searchQuery]
  );

  // Track which country codes already exist so the "Add Country" dialog can disable them
  const existingCountryCodes = useMemo(() => {
    const codes = new Set<string>();
    if (locations) {
      for (const loc of locations) {
        if (loc.type === "country" && loc.country_code) {
          codes.add(loc.country_code);
        }
      }
    }
    return codes;
  }, [locations]);

  const handleAddRoot = () => {
    setEditingLocation(undefined);
    setParentLocation(null);
    setFormOpen(true);
  };

  const handleAddChild = (parent: Location) => {
    setEditingLocation(undefined);
    setParentLocation(parent);
    setFormOpen(true);
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setParentLocation(null);
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: LocationFormValues) => {
    if (editingLocation) {
      await updateLocation.mutateAsync({
        id: editingLocation.id,
        updates: { name: values.name },
      });
    } else {
      await createLocation.mutateAsync({
        name: values.name,
        type: values.type,
        parent_id: values.parent_id,
        country_code: values.country_code,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <Button onClick={handleAddRoot}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addCountry')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 animate-pulse"
                  style={{ paddingLeft: `${((i - 1) % 3) * 20 + 8}px` }}
                >
                  <div className="h-4 w-4 rounded bg-muted" />
                  <div className="h-4 w-28 rounded bg-muted" />
                  <div className="h-5 w-16 rounded-full bg-muted" />
                </div>
              ))}
            </div>
          ) : (
            <LocationTree
              nodes={filteredTree}
              onAdd={handleAddChild}
              onEdit={handleEdit}
              searchQuery={searchQuery}
            />
          )}
        </CardContent>
      </Card>

      <LocationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleFormSubmit}
        isPending={createLocation.isPending || updateLocation.isPending}
        initialValues={editingLocation}
        parent={parentLocation}
        existingCountryCodes={existingCountryCodes}
      />
    </div>
  );
}
