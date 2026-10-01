# Marketing media

The photographs and video stills on the public pages, and the home hero's "Calm" loop
whose videos live in `public/media/`. Everything here is cut from a master that is
**never committed**: masters are delivered by the marketing team as full-size files
(`.mov` at 1920×1080 or 1080×1920, 60 fps, with an audio track; photos up to 3360px
wide), and the repo holds only what a page serves.

## Cleared for publication

The owner cleared this set on 2026-10-01: every member of staff shown has consented, and
no child's face is identifiable in any of them — the club photo was judged fine
uncropped. A new photo of people needs the same clearance before it is committed, and a
crop is a new picture, so a photo is shown whole, in its own proportions.

| File | Master |
|---|---|
| `club-lauttasaari.jpg` | `Live Club - Gedu and Gamer - GameDev 5.JPG` — an in-person club, children from behind, a Gedu beside them |
| `studio-lauttasaari.jpg` | `Lauttasaari Pelistudio - PC Game Studio 1.JPG` — the studio, empty |
| `team-pelipaku.jpg` | `Pelipaku - Lilli ja Shirin 1.png` — two staff at an event stand |
| `hero-calm-{wide,close,vertical}-poster.jpg` | The first frame of the matching encode in `public/media/` |
| `public/media/hero-calm-{wide,close,vertical}-v1.mp4` | `Sogverse - Calm - Horizontal - Wide.mov`, `… - Horizontal - Close.mov`, `… - Vertical.mov` |

The three loop cuts are delivered framed for their shapes and are never cropped from one
another; the hero picks one by the viewport's shape.

## Making the videos

Each master is re-encoded at its own resolution: video only (audio, data streams and
metadata dropped), 30 fps, H.264 in an MP4 with the index at the front so playback
starts before the download ends.

```sh
ffmpeg -i "<master>.mov" -map 0:v:0 -an -dn -sn -map_metadata -1 \
  -vf "fps=30,scale=<W>:<H>:flags=lanczos" \
  -c:v libx264 -preset veryslow -crf 30 -pix_fmt yuv420p -profile:v high \
  -movflags +faststart public/media/<name>-v<N>.mp4
```

CRF 30 was chosen by measurement against the master (VMAF at 1080p): it lands each
20-second cut at 2.2–2.6 MB, and the loop is only ever seen under the hero's scrim, which
hides the difference to CRF 27 (4.4 MB). H.264 only: AV1 measured about a third smaller
at equal quality, but a decorative loop is the wrong place to spend software AV1 decoding
on the phones that lack hardware for it.

The poster is the encode's **first frame**, not the master's, so the swap from still to
video shows no seam:

```sh
ffmpeg -i public/media/<name>-v<N>.mp4 -frames:v 1 first-frame.png
```

## Making the stills

Through `sharp`, run from the repo root so it resolves; EXIF and other metadata are
dropped by default, which is wanted (camera and location data stay out of the repo).

```js
sharp(master).rotate().resize({ width, withoutEnlargement: true })
  .jpeg({ quality: 80, mozjpeg: true }).toFile(out)
```

Width is set by the largest size a page draws the photo at, doubled for a dense screen:
2000px for the club photo, 1600px for the studio, the team photo at its own 675px, the
posters at the encode's resolution. Stills are imported statically, so the bundler
content-hashes them and hands `next/image` their intrinsic size, which reserves each
box before the bytes arrive; every call site states a real `sizes`.

## Versioned names and the cache rule

`public/media/` is served `Cache-Control: public, max-age=31536000, immutable` (a
`headers()` rule in `next.config.ts`), and the proxy's matcher skips the prefix so no
response there carries a cookie. That is only safe because **a file there is never
replaced in place**: changed bytes ship under the next version (`-v2.mp4`) and the page
points at the new name. Overwriting `-v1` would leave every visitor who has it on the old
bytes for a year. The stills need no version in their names: the bundler's content hash
already changes their URL when their bytes do.
