#!/usr/bin/env bash
#
# `rich-images` — give every product the rich seed created a picture, and each
# team profile it saved its photo (the second half, at the end of this file).
#
#   rich-images.sh <checkout-path> <project-id> <api-url> <service-role-key>
#
# Run by `up` and `reset` straight after supabase/rich-seed.sql, never on its
# own: it assumes that file's catalogue is there and it is not idempotent in any
# way the seed is not (both are safe to repeat, and both are pointless to).
#
# WHY THIS IS NOT SQL. A product's picture is a `catalogue_images` row, and that
# row names an object in its purpose's storage bucket (`product-images` for a
# product picture, `library-covers` for a Library cover) by the sha256 of
# its bytes — a CHECK requires `path` to be exactly `<sha256>.<ext>`, and the
# sha256 column to be 64 lowercase hex characters. A row can therefore only be
# written after the bytes are in the bucket, and the bucket is reached over
# HTTP, not over the database connection. So this step is two halves:
#
#   1. Upload each file in supabase/seed-images/ to its purpose's bucket at
#      <sha>.<ext>, through the storage API with the service-role key — the
#      same client and the same key the admin upload route uses.
#   2. Write the catalogue rows and link them to products over psql under the
#      admin's claims — the half the route does on the CALLER's own session,
#      where the table's admin-only policy is what admits the write.
#
# `products.image_path`, the column every reader actually paints, is written by
# neither half: a trigger derives it from the linked row on every products
# write. Setting `image_id` is the whole of linking a picture, exactly as it is
# in the route.
#
# WHICH PICTURE A PRODUCT GETS IS ITS TOPIC. Each file is named for a value of
# the `product_topic` enum, so the mapping needs no product names and survives
# every rename — and two products on one topic share one catalogue entry, which
# is the dedup the real catalogue does anyway. A product whose topic has no file
# fails this script by name, because the alternative is a stack that quietly
# comes up with a hole in it.
#
# LIBRARY COVERS RIDE THE SAME TWO HALVES. A file named `library-<category>`
# is a Library cover rather than a product picture: its catalogue entry has
# the purpose `library_cover` and its object goes to the `library-covers`
# bucket, which takes JPEG only (each file is a JPEG of exactly 1600 x 900,
# the size the upload route would demand of it). It becomes the cover of every
# article the rich seed wrote in that category, on the working copy and on the
# published copy alike, which is what publishing would have copied had the
# cover been there when the seed published. A category with no file leaves its
# articles without a cover, and that is how the seed shows a live article on
# the NO IMAGE placeholder; a cover whose category has no article is one more
# entry for the cover picker to offer.
set -euo pipefail

checkout=$1
project=$2
api_url=$3
service_key=$4

images_dir="$checkout/supabase/seed-images"
product_bucket=product-images
cover_bucket=library-covers

if [ ! -d "$images_dir" ]; then
  echo "No $images_dir to upload; the products will keep their placeholders." >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The manifests, one line per file: topic (or category), sha256, extension,
# path. Built first so the SQL below and the uploads above it cannot disagree
# about a path. Product pictures and Library covers are kept apart from here
# on, because they differ in purpose, in bucket and in what they are linked to.
: > "$work/manifest"
: > "$work/covers"
for file in "$images_dir"/*; do
  [ -f "$file" ] || continue
  base=$(basename "$file")
  topic=${base%.*}
  ext=${base##*.}
  case "$ext" in
    # The extensions chk_catalogue_images_path_matches_sha256 admits. `jpeg` is
    # deliberately absent: the route normalises it to `jpg` before storing, and
    # the CHECK knows only the normalised form.
    jpg | png | webp | avif) ;;
    *)
      echo "$base is not a product image type (jpg, png, webp, avif)." >&2
      exit 1
      ;;
  esac
  sha=$(sha256sum "$file" | cut -d' ' -f1)
  case "$topic" in
    library-*)
      printf '%s\t%s\t%s\t%s\n' "${topic#library-}" "$sha" "$ext" "$file" >> "$work/covers"
      ;;
    *)
      printf '%s\t%s\t%s\t%s\n' "$topic" "$sha" "$ext" "$file" >> "$work/manifest"
      ;;
  esac
done

if [ ! -s "$work/manifest" ]; then
  echo "$images_dir holds no product pictures." >&2
  exit 1
fi

if [ ! -s "$work/covers" ]; then
  echo "$images_dir holds no Library covers (library-<category>.jpg)." >&2
  exit 1
fi

content_type() {
  case "$1" in
    jpg) printf 'image/jpeg' ;;
    png) printf 'image/png' ;;
    webp) printf 'image/webp' ;;
    avif) printf 'image/avif' ;;
  esac
}

uploaded=0
upload() {
  local bucket=$1 sha=$2 ext=$3 file=$4
  # `upsert: false`, like the route. An object named for the hash of its own
  # bytes cannot be stale, so storage answering "already exists" is SUCCESS —
  # the bytes at that key are by construction the bytes we were about to write,
  # and that is the ordinary answer on a second `up` against a stack whose
  # storage volume outlived its database.
  status=$(curl -sS -o "$work/upload.out" -w '%{http_code}' \
    -X POST "$api_url/storage/v1/object/$bucket/$sha.$ext" \
    -H "Authorization: Bearer $service_key" \
    -H "Content-Type: $(content_type "$ext")" \
    -H "cache-control: max-age=31536000" \
    -H "x-upsert: false" \
    --data-binary "@$file")

  case "$status" in
    200 | 201)
      uploaded=$((uploaded + 1))
      ;;
    409)
      # Storage's duplicate status as an HTTP status, for the day it sends one.
      ;;
    *)
      # "Already there" is not reliably an HTTP 409: storage answers the second
      # upload of an existing key with a 400 whose BODY carries
      # `"statusCode":"409"`. That one shape is what counts as a duplicate here,
      # and nothing else in the body is read: matching a bare `Duplicate` or
      # `already exists` anywhere in it would also swallow an unrelated failure
      # whose message happened to contain the words, and a picture silently not
      # uploaded is the failure this step exists to make loud.
      if grep -qE '"statusCode" *: *"?409"?' "$work/upload.out"; then
        return
      fi
      echo "Uploading $(basename "$file") to the $bucket bucket failed ($status):" >&2
      cat "$work/upload.out" >&2
      exit 1
      ;;
  esac
}
while IFS=$'\t' read -r _ sha ext file; do
  upload "$product_bucket" "$sha" "$ext" "$file"
done < "$work/manifest"
while IFS=$'\t' read -r _ sha ext file; do
  upload "$cover_bucket" "$sha" "$ext" "$file"
done < "$work/covers"

# The manifest as a SQL row set, written once and inlined twice below. A temp
# table would read better and is not available: the statements run under
# `authenticated`, which owns no temp schema and could not read one postgres had
# made for it.
awk -F'\t' '{
  printf "%s      (%c%s%c, %c%s%c, %c%s%c)", (NR == 1 ? "" : ",\n"), 39, $1, 39, 39, $2, 39, 39, $3, 39
} END { print "" }' "$work/manifest" > "$work/values.sql"
awk -F'\t' '{
  printf "%s      (%c%s%c, %c%s%c, %c%s%c)", (NR == 1 ? "" : ",\n"), 39, $1, 39, 39, $2, 39, 39, $3, 39
} END { print "" }' "$work/covers" > "$work/covers.sql"

# The catalogue half. Written as a file rather than piped inline because it is
# built from the manifest and is easier to read back when something fails.
{
  echo "BEGIN;"
  echo "SELECT set_config('request.jwt.claims',"
  echo "  json_build_object('sub', (SELECT id::text FROM public.profiles"
  echo "                             WHERE email = 'admin@example.com'),"
  echo "                    'role', 'authenticated')::text, true);"
  echo "SET LOCAL ROLE authenticated;"
  echo
  # A label an admin can read in the catalogue dialog. The topic is the source
  # of it for the same reason it is the source of the mapping. Every file
  # in this manifest is a product picture, so every entry's purpose is
  # `product` — and each file is exactly 1200 x 800, the size the upload route
  # would demand of it.
  echo "INSERT INTO public.catalogue_images (label, sha256, path, purpose)"
  echo "SELECT CASE s.topic WHEN 'ai' THEN 'AI'"
  echo "                    ELSE initcap(replace(s.topic, '_', ' ')) END,"
  echo "       s.sha, s.sha || '.' || s.ext, 'product'"
  echo "  FROM (VALUES"
  cat "$work/values.sql"
  echo "       ) AS s(topic, sha, ext)"
  echo " ON CONFLICT (purpose, sha256) DO NOTHING;"
  echo
  # The link, and the ONLY thing that gives a product a picture. image_path is
  # not named here and must not be: the trigger on products derives it.
  echo "UPDATE public.products p"
  echo "   SET image_id = i.id"
  echo "  FROM (VALUES"
  cat "$work/values.sql"
  echo "       ) AS s(topic, sha, ext)"
  echo "  JOIN public.catalogue_images i ON i.purpose = 'product' AND i.sha256 = s.sha"
  echo " WHERE p.topic::text = s.topic;"
  echo
  # The covers' entries, of purpose `library_cover` and labelled for the
  # category they were drawn for. The cast is what refuses a file named for no
  # category.
  echo "INSERT INTO public.catalogue_images (label, sha256, path, purpose)"
  echo "SELECT upper(left(s.category, 1)) || replace(substr(s.category, 2), '_', ' ') || ' cover',"
  echo "       s.sha, s.sha || '.' || s.ext, 'library_cover'"
  echo "  FROM (VALUES"
  cat "$work/covers.sql"
  echo "       ) AS s(category, sha, ext)"
  echo " WHERE s.category::public.library_article_category IS NOT NULL"
  echo " ON CONFLICT (purpose, sha256) DO NOTHING;"
  echo
  # The completeness check runs as the session role rather than as
  # `authenticated`, because it reads storage.objects: neither bucket carries a
  # read policy a signed-in admin could pass, so under the impersonated claims
  # above every object would read as absent and the check would fail on every
  # run.
  echo "RESET ROLE;"
  echo
  # The covers' links, as the session role: neither Library table carries a
  # write grant, and an admin's own way to set a cover is a save and a
  # publish, which would move the dates the seed gave both copies. The
  # cover-path trigger still derives each path and still refuses anything not
  # a library_cover entry; only the updated_at trigger is held off, because linking a cover
  # here is not an admin's save.
  echo "ALTER TABLE public.library_articles DISABLE TRIGGER library_articles_updated_at;"
  echo "UPDATE public.library_articles a"
  echo "   SET cover_image_id = i.id"
  echo "  FROM (VALUES"
  cat "$work/covers.sql"
  echo "       ) AS s(category, sha, ext)"
  echo "  JOIN public.catalogue_images i ON i.purpose = 'library_cover' AND i.sha256 = s.sha"
  echo " WHERE a.category::text = s.category;"
  echo "ALTER TABLE public.library_articles ENABLE TRIGGER library_articles_updated_at;"
  echo "UPDATE public.library_article_publications p"
  echo "   SET cover_image_id = i.id"
  echo "  FROM (VALUES"
  cat "$work/covers.sql"
  echo "       ) AS s(category, sha, ext)"
  echo "  JOIN public.catalogue_images i ON i.purpose = 'library_cover' AND i.sha256 = s.sha"
  echo " WHERE p.category::text = s.category;"
  echo
  echo "DO \$\$"
  echo "DECLARE v_missing text;"
  echo "        v_absent text;"
  echo "BEGIN"
  echo "  SELECT string_agg(DISTINCT p.topic::text, ', ') INTO v_missing"
  echo "    FROM public.products p WHERE p.image_id IS NULL;"
  echo "  IF v_missing IS NOT NULL THEN"
  echo "    RAISE EXCEPTION"
  echo "      'No seed image for product topic(s) %. Add supabase/seed-images/<topic>.png for each and bring the stack up again.', v_missing;"
  echo "  END IF;"
  # A linked row is only half a picture. The row is written over psql and the
  # bytes go up over HTTP, so a run whose upload half quietly did nothing would
  # leave every product linked to an object the bucket does not hold — which
  # renders as a broken image, not as a placeholder, and nothing else would say
  # so. The Library's covers are held to the same, live and draft alike.
  echo "  SELECT string_agg(DISTINCT i.path, ', ') INTO v_absent"
  echo "    FROM public.catalogue_images i"
  echo "   WHERE (EXISTS (SELECT 1 FROM public.products p WHERE p.image_id = i.id)"
  echo "          OR EXISTS (SELECT 1 FROM public.library_articles a WHERE a.cover_image_id = i.id)"
  echo "          OR EXISTS (SELECT 1 FROM public.library_article_publications l WHERE l.cover_image_id = i.id))"
  echo "     AND NOT EXISTS (SELECT 1 FROM storage.objects o"
  echo "                      WHERE o.bucket_id = CASE i.purpose"
  echo "                                            WHEN 'product' THEN '$product_bucket'"
  echo "                                            WHEN 'library_cover' THEN '$cover_bucket'"
  echo "                                          END"
  echo "                        AND o.name = i.path);"
  echo "  IF v_absent IS NOT NULL THEN"
  echo "    RAISE EXCEPTION"
  echo "      'No object in its purpose''s bucket for %. The upload half of this step did not land; bring the stack up again.', v_absent;"
  echo "  END IF;"
  echo "  RAISE NOTICE 'rich-seed images: % catalogue entries over % products',"
  echo "    (SELECT count(*) FROM public.catalogue_images WHERE purpose = 'product'),"
  echo "    (SELECT count(*) FROM public.products WHERE image_id IS NOT NULL);"
  echo "  RAISE NOTICE 'rich-seed images: % Library covers over % articles, % of them live',"
  echo "    (SELECT count(*) FROM public.catalogue_images WHERE purpose = 'library_cover'),"
  echo "    (SELECT count(*) FROM public.library_articles WHERE cover_image_id IS NOT NULL),"
  echo "    (SELECT count(*) FROM public.library_article_publications WHERE cover_image_id IS NOT NULL);"
  echo "END"
  echo "\$\$;"
  echo "COMMIT;"
} > "$work/link.sql"

docker exec -i "supabase_db_$project" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$work/link.sql" >/dev/null

echo "Product images: $(wc -l < "$work/manifest") files to the $product_bucket bucket and $(wc -l < "$work/covers") Library covers to the $cover_bucket bucket, $uploaded newly uploaded."

# TEAM PHOTOS. The rich seed saves the owner's admin, the second admin, the
# gedu and Aino with their checkbox on, which save_team_profile allows only with a
# photo, so the seed names each photo's path and the bytes go up here, to
# exactly that path. The pictures are the preview art the team fixtures
# borrow: abstract art, never a picture of a person. `x-upsert: true` because
# a path names one person on one database, and a second `up` over a storage
# volume that outlived its database is writing the same bytes again.
team_bucket=team-photos
for pair in "admin@example.com:session-badge.jpg" "admin2@example.com:session-arena.jpg" "gedu@example.com:session-tower.jpg" "aino.virtanen@example.com:session-build.jpg"; do
  email=${pair%%:*}
  art="$checkout/public/preview-art/${pair#*:}"
  path=$(docker exec -i "supabase_db_$project" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tAq \
    -c "SELECT tp.photo_path FROM public.team_profiles tp JOIN public.profiles p ON p.id = tp.user_id WHERE p.email = '$email'")
  if [ -z "$path" ]; then
    echo "The rich seed saved no team profile photo for $email." >&2
    exit 1
  fi
  # The seed put an empty object row at the path so save_team_profile would
  # take it. An upload over a row the storage API did not make leaves an
  # object that fails to download, so the API removes that row first.
  curl -sS -o /dev/null -X DELETE "$api_url/storage/v1/object/$team_bucket/$path" \
    -H "Authorization: Bearer $service_key"
  status=$(curl -sS -o "$work/upload.out" -w '%{http_code}' \
    -X POST "$api_url/storage/v1/object/$team_bucket/$path" \
    -H "Authorization: Bearer $service_key" \
    -H "Content-Type: image/jpeg" \
    -H "x-upsert: true" \
    --data-binary "@$art")
  case "$status" in
    200 | 201) ;;
    *)
      echo "Uploading the team photo for $email failed ($status):" >&2
      cat "$work/upload.out" >&2
      exit 1
      ;;
  esac
done
echo "Team photos: 4 uploaded to the $team_bucket bucket."
