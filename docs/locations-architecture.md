# Locations Architecture

Hierarchical location system for mapping products and gedus to geographic regions, powering substitute matching, and supporting international expansion.

## Overview

Locations use a self-referential adjacency list: one `locations` table where each row can have a `parent_id` pointing to another row. A `location_type` enum classifies each level of the hierarchy. This keeps the schema simple while supporting arbitrary depth.

The hierarchy is shallow in practice (3-5 levels), so PostgreSQL's `WITH RECURSIVE` CTEs handle ancestor/descendant queries efficiently without needing specialized extensions.

## Location Types

| Type | Description | Examples |
|------|-------------|----------|
| `country` | Top-level, no parent | Finland, United States, United Kingdom |
| `region` | State, province, county, maakunta | Uusimaa, California, England, Maharashtra |
| `municipality` | City, town, kunta | Helsinki, Houston, Manchester, Mumbai |
| `district` | School district, borough, neighborhood | LAUSD, Camden, Shinjuku |
| `site` | Individual school, company, building | Ressu School, Lincoln High School |

Not every country needs every level. Finland may skip `district` entirely. The hierarchy is flexible, not rigid.

## Schema

```sql
CREATE TYPE location_type AS ENUM (
  'country', 'region', 'municipality', 'district', 'site'
);

CREATE TABLE locations (
  id           UUID PRIMARY KEY,
  name         TEXT NOT NULL,
  type         location_type NOT NULL,
  parent_id    UUID REFERENCES locations(id) ON DELETE RESTRICT,
  country_code TEXT,  -- ISO 3166-1 alpha-2, denormalized
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
);
```

`country_code` is denormalized on every row to avoid recursive lookups for the most common filter (country-level filtering). `ON DELETE RESTRICT` prevents accidentally orphaning child locations.

## International Examples

### Finland

```
Finland (country, FI)
├── Uusimaa (region)
│   ├── Helsinki (municipality)
│   │   └── Ressu School (site)
│   ├── Espoo (municipality)
│   └── Vantaa (municipality)
├── Pirkanmaa (region)
│   └── Tampere (municipality)
└── Varsinais-Suomi (region)
    └── Turku (municipality)
```

### United States

```
USA (country, US)
├── California (region)
│   ├── Los Angeles (municipality)
│   │   ├── LAUSD (district)
│   │   │   └── Lincoln High School (site)
│   │   └── Compton USD (district)
│   └── San Francisco (municipality)
│       └── SFUSD (district)
├── Texas (region)
│   ├── Houston (municipality)
│   │   └── Houston ISD (district)
│   └── Austin (municipality)
│       └── Austin ISD (district)
└── New York (region)
    └── New York City (municipality)
        ├── Manhattan (district)
        └── Brooklyn (district)
```

In the US, school districts don't always align with city boundaries (e.g. LAUSD covers parts of multiple cities). A district is parented under whichever municipality it's primarily associated with. If a district truly spans cities, it can be parented at the region level instead.

### United Kingdom

```
United Kingdom (country, GB)
├── England (region)
│   ├── London (municipality)
│   │   ├── Camden (district)
│   │   │   └── Regent High School (site)
│   │   └── Hackney (district)
│   ├── Manchester (municipality)
│   └── Birmingham (municipality)
├── Scotland (region)
│   ├── Edinburgh (municipality)
│   └── Glasgow (municipality)
├── Wales (region)
│   └── Cardiff (municipality)
└── Northern Ireland (region)
    └── Belfast (municipality)
```

England, Scotland, Wales, and Northern Ireland map to `region`. London boroughs are `district`.

### India

```
India (country, IN)
├── Maharashtra (region)
│   ├── Mumbai (municipality)
│   │   ├── Andheri (district)
│   │   └── Bandra (district)
│   └── Pune (municipality)
├── Karnataka (region)
│   ├── Bengaluru (municipality)
│   └── Mysuru (municipality)
├── Tamil Nadu (region)
│   └── Chennai (municipality)
└── Delhi (region)
    └── New Delhi (municipality)
        ├── South Delhi (district)
        └── Central Delhi (district)
```

Indian states map to `region`. For large metro areas like Mumbai, neighborhoods or zones become `district`.

### South Africa

```
South Africa (country, ZA)
├── Gauteng (region)
│   ├── Johannesburg (municipality)
│   │   ├── Sandton (district)
│   │   └── Soweto (district)
│   └── Pretoria (municipality)
├── Western Cape (region)
│   └── Cape Town (municipality)
│       ├── City Bowl (district)
│       └── Cape Flats (district)
├── KwaZulu-Natal (region)
│   └── Durban (municipality)
└── Eastern Cape (region)
    └── Port Elizabeth (municipality)
```

South African provinces map to `region`. Metro sub-areas become `district`.

### China

```
China (country, CN)
├── Beijing (region)
│   └── Beijing (municipality)
│       ├── Haidian (district)
│       └── Chaoyang (district)
├── Guangdong (region)
│   ├── Guangzhou (municipality)
│   │   └── Tianhe (district)
│   └── Shenzhen (municipality)
│       └── Nanshan (district)
├── Shanghai (region)
│   └── Shanghai (municipality)
│       ├── Pudong (district)
│       └── Jing'an (district)
└── Zhejiang (region)
    └── Hangzhou (municipality)
```

Chinese provinces and direct-controlled municipalities (Beijing, Shanghai) map to `region`. Urban districts map naturally to `district`.

### Japan

```
Japan (country, JP)
├── Tokyo (region)
│   └── Tokyo (municipality)
│       ├── Shinjuku (district)
│       ├── Shibuya (district)
│       └── Minato (district)
├── Osaka (region)
│   └── Osaka (municipality)
│       └── Chuo (district)
├── Kanagawa (region)
│   └── Yokohama (municipality)
└── Kyoto (region)
    └── Kyoto (municipality)
```

Japanese prefectures map to `region`. Tokyo's special wards and other city wards map to `district`.

## Type Mapping by Country

| Type | Finland | US | UK | India | South Africa | China | Japan |
|------|---------|----|----|-------|-------------|-------|-------|
| country | Finland | USA | United Kingdom | India | South Africa | China | Japan |
| region | maakunta | state | nation | state | province | province | prefecture |
| municipality | kunta | city | city | city | metro | city | city |
| district | -- | school district | borough | zone | sub-area | urban district | ward |
| site | school | school | school | school | school | school | school |

## Localised Labels

Location type labels (Region, Municipality, Site, etc.) are translated only for the country whose language matches the user's UI language. All other countries display English labels.

**Rationale:** A Finnish admin managing Finland's locations should see "Maakunta" (region) and "Kunta" (municipality) — the natural administrative terms. But when viewing UK locations, "Borough" stays in English because that's the actual British term and translating it to Finnish wouldn't add clarity.

**Implementation:** Each `HierarchyLevel` in `SUPPORTED_COUNTRIES` has an optional `i18n` map keyed by locale. The `resolveLabels(level, locale)` helper picks the localised pair or falls back to the English default. Country names also support `nameI18n` (e.g. Finland → Suomi in Finnish).

**When adding a new country with a supported UI language:** add `i18n` entries to each hierarchy level and a `nameI18n` entry. When adding a country whose language isn't a supported UI language, no `i18n` is needed — English labels are the default.

## UI: Cascading Dropdowns

The hierarchy powers cascading dropdown selectors:

1. Select country: `WHERE parent_id IS NULL AND type = 'country'`
2. Select region: `WHERE parent_id = :country_id AND type = 'region'`
3. Select municipality: `WHERE parent_id = :region_id AND type = 'municipality'`
4. (Optional) Select district: `WHERE parent_id = :municipality_id AND type = 'district'`

Each dropdown filters based on the parent selection. If a level has no children (e.g. Finland has no districts), that dropdown is skipped.

## Breadcrumb / Full Path Query

```sql
WITH RECURSIVE ancestors AS (
  SELECT id, name, type, parent_id, 1 AS depth
  FROM locations WHERE id = :selected_id
  UNION ALL
  SELECT l.id, l.name, l.type, l.parent_id, a.depth + 1
  FROM locations l JOIN ancestors a ON l.id = a.parent_id
)
SELECT * FROM ancestors ORDER BY depth DESC;
-- Returns: Finland > Uusimaa > Helsinki
```

## Future: Linking to Products and Gedus

Products will have exactly one location (FK on `products` table). Gedus can have multiple locations via a junction table, representing areas where they can substitute.

```sql
-- Products: one location each
ALTER TABLE products ADD COLUMN location_id UUID REFERENCES locations(id);

-- Gedus: multiple locations
CREATE TABLE gedu_locations (
  gedu_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (gedu_id, location_id)
);
```

### Gedu Location Selection

Gedus can select locations at **any level** of the hierarchy:
- Selecting a region (e.g. "Uusimaa") means "I can substitute anywhere in this region"
- Selecting a municipality (e.g. "Helsinki") means "only in this city"
- Selecting a site (e.g. "Ressu School") means "only at this specific location"

### Substitute Matching

Find gedus who can cover a product's location by walking up the ancestor chain:

```sql
WITH RECURSIVE ancestors AS (
  SELECT id FROM locations WHERE id = :product_location_id
  UNION ALL
  SELECT l.parent_id FROM locations l
  JOIN ancestors a ON l.id = a.id
  WHERE l.parent_id IS NOT NULL
)
SELECT DISTINCT gl.gedu_id
FROM gedu_locations gl
WHERE gl.location_id IN (SELECT id FROM ancestors);
```

A product in Helsinki matches gedus who selected Helsinki, Uusimaa, or Finland.

