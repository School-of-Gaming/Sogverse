-- A session photo's dimensions are measured, not claimed.
--
-- Comments only — no column, constraint, grant or policy moves. The upload
-- route now re-encodes every accepted photo through the shared `sharp` pass
-- before it stores anything (the same pass chat images introduced, extended
-- here at the owner's request so the EXIF/GPS strip is one server-side
-- mechanism covering both routes), and that pass reports the true output size.
-- So the two dimension columns stopped holding a number the client sent the
-- moment the route changed, and these comments still said they did.
--
-- Worth a migration of its own because the claim they made was a safeguarding
-- one in miniature — "trusted after a bound check" is a statement about what
-- the database believes it is storing, and `schema.sql` is where the next
-- reader meets it. The 4096 CHECK is unchanged and still a sanity bound; what
-- changed is what it is a bound ON.

COMMENT ON COLUMN public.group_session_images.width IS
  'The stored image''s pixel width, MEASURED SERVER-SIDE by the upload route''s '
  're-encode. All gallery and email geometry is arithmetic from this and '
  '`height` — never measured at render — which is what lets server HTML and '
  'first client paint agree and keeps a mail laying out correctly with every '
  'image blocked. The form still carries a claimed pair, but only as an early '
  'plausibility refusal that gives the gedu dimension copy rather than a '
  'generic failure; it never reaches this column. The CHECK''s 4096 is a SANITY '
  'ceiling, deliberately looser than the client''s ~2048 px edge cap and not '
  'derived from it — the route refuses a decode past it before the insert, and '
  'this is what stands behind that.';

COMMENT ON COLUMN public.group_session_images.height IS
  'The stored image''s pixel height. See `width` — the same server-side '
  'measurement, the same sanity ceiling, and both are written by the route from '
  'what its re-encode saw rather than from anything a client sent.';
