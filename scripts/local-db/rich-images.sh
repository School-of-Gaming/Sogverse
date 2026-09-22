#!/usr/bin/env bash
#
# `rich-images` — give every product the rich seed created a picture.
#
#   rich-images.sh <checkout-path> <project-id> <api-url> <service-role-key>
#
# Run by `up` and `reset` straight after supabase/rich-seed.sql, never on its
# own: it assumes that file's catalogue is there and it is not idempotent in any
# way the seed is not (both are safe to repeat, and both are pointless to).
#
# WHY THIS IS NOT SQL. A product's picture is a `product_images` row, and that
# row names an object in the `product-images` storage bucket by the sha256 of
# its bytes — a CHECK requires `path` to be exactly `<sha256>.<ext>`, and the
# sha256 column to be 64 lowercase hex characters. A row can therefore only be
# written after the bytes are in the bucket, and the bucket is reached over
# HTTP, not over the database connection. So this step is two halves:
#
#   1. Upload each file in supabase/seed-images/ to the bucket at <sha>.<ext>,
#      through the storage API with the service-role key — the same client and
#      the same key the admin upload route uses, because the bucket carries no
#      policy a signed-in admin could pass.
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
set -euo pipefail

checkout=$1
project=$2
api_url=$3
service_key=$4

images_dir="$checkout/supabase/seed-images"
bucket=product-images

if [ ! -d "$images_dir" ]; then
  echo "No $images_dir to upload; the products will keep their placeholders." >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The manifest, one line per file: topic, sha256, extension. Built first so the
# SQL below and the uploads above it cannot disagree about a path.
: > "$work/manifest"
for file in "$images_dir"/*; do
  [ -f "$file" ] || continue
  base=$(basename "$file")
  topic=${base%.*}
  ext=${base##*.}
  case "$ext" in
    # The extensions chk_product_images_path_matches_sha256 admits. `jpeg` is
    # deliberately absent: the route normalises it to `jpg` before storing, and
    # the CHECK knows only the normalised form.
    jpg | png | webp | avif | svg) ;;
    *)
      echo "$base is not a product image type (jpg, png, webp, avif, svg)." >&2
      exit 1
      ;;
  esac
  sha=$(sha256sum "$file" | cut -d' ' -f1)
  printf '%s\t%s\t%s\t%s\n' "$topic" "$sha" "$ext" "$file" >> "$work/manifest"
done

if [ ! -s "$work/manifest" ]; then
  echo "$images_dir holds no files." >&2
  exit 1
fi

content_type() {
  case "$1" in
    jpg) printf 'image/jpeg' ;;
    png) printf 'image/png' ;;
    webp) printf 'image/webp' ;;
    avif) printf 'image/avif' ;;
    svg) printf 'image/svg+xml' ;;
  esac
}

uploaded=0
while IFS=$'\t' read -r topic sha ext file; do
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
        continue
      fi
      echo "Uploading $(basename "$file") to the $bucket bucket failed ($status):" >&2
      cat "$work/upload.out" >&2
      exit 1
      ;;
  esac
done < "$work/manifest"

# The manifest as a SQL row set, written once and inlined twice below. A temp
# table would read better and is not available: the statements run under
# `authenticated`, which owns no temp schema and could not read one postgres had
# made for it.
awk -F'\t' '{
  printf "%s      (%c%s%c, %c%s%c, %c%s%c)", (NR == 1 ? "" : ",\n"), 39, $1, 39, 39, $2, 39, 39, $3, 39
} END { print "" }' "$work/manifest" > "$work/values.sql"

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
  # of it for the same reason it is the source of the mapping.
  echo "INSERT INTO public.product_images (label, sha256, path)"
  echo "SELECT CASE s.topic WHEN 'ai' THEN 'AI'"
  echo "                    ELSE initcap(replace(s.topic, '_', ' ')) END,"
  echo "       s.sha, s.sha || '.' || s.ext"
  echo "  FROM (VALUES"
  cat "$work/values.sql"
  echo "       ) AS s(topic, sha, ext)"
  echo " ON CONFLICT (sha256) DO NOTHING;"
  echo
  # The link, and the ONLY thing that gives a product a picture. image_path is
  # not named here and must not be: the trigger on products derives it.
  echo "UPDATE public.products p"
  echo "   SET image_id = i.id"
  echo "  FROM (VALUES"
  cat "$work/values.sql"
  echo "       ) AS s(topic, sha, ext)"
  echo "  JOIN public.product_images i ON i.sha256 = s.sha"
  echo " WHERE p.topic::text = s.topic;"
  echo
  # The completeness check runs as the session role rather than as
  # `authenticated`, because it reads storage.objects: the bucket carries no
  # policy a signed-in admin could pass, so under the impersonated claims above
  # every object would read as absent and the check would fail on every run.
  echo "RESET ROLE;"
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
  # so.
  echo "  SELECT string_agg(DISTINCT i.path, ', ') INTO v_absent"
  echo "    FROM public.products p"
  echo "    JOIN public.product_images i ON i.id = p.image_id"
  echo "   WHERE NOT EXISTS (SELECT 1 FROM storage.objects o"
  echo "                      WHERE o.bucket_id = '$bucket' AND o.name = i.path);"
  echo "  IF v_absent IS NOT NULL THEN"
  echo "    RAISE EXCEPTION"
  echo "      'The $bucket bucket holds no object for %. The upload half of this step did not land; bring the stack up again.', v_absent;"
  echo "  END IF;"
  echo "  RAISE NOTICE 'rich-seed images: % catalogue entries over % products',"
  echo "    (SELECT count(*) FROM public.product_images),"
  echo "    (SELECT count(*) FROM public.products WHERE image_id IS NOT NULL);"
  echo "END"
  echo "\$\$;"
  echo "COMMIT;"
} > "$work/link.sql"

docker exec -i "supabase_db_$project" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$work/link.sql" >/dev/null

echo "Product images: $(wc -l < "$work/manifest") files, $uploaded newly uploaded to the $bucket bucket."
