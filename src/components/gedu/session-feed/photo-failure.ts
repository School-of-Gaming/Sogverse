import { ApiError } from "@/lib/api/api-error";
import { NormalizeImageError } from "@/lib/images/normalize-image";
import {
  isSessionPhotoErrorCode,
  type SessionPhotoErrorCode,
} from "@/services/gedu-sessions";

/**
 * Which of the feature's stable refusal codes a caught photo failure is.
 *
 * **One vocabulary, two origins.** A photo can be refused in the browser (the
 * decoder will not open a raw HEIC, a canvas encode fails) or at the route (the
 * bytes are not a JPEG, the session is full, the caller does not teach the
 * group). The gedu does not care which side answered — they care what to do
 * next — so both arrive here and leave as one union the strip resolves with
 * `t()`.
 *
 * **Never on the message, always on the code.** A route's `message` is raw
 * English written for a log, and a reworded refusal must not be able to change
 * what a gedu is told or which copy they get. Anything unrecognized — a dropped
 * connection, a 500 with no body, a code from a newer route than this build
 * knows about — is `uploadFailed`, whose copy is "try again", which is the
 * honest answer to a failure nobody can classify.
 */
export function sessionPhotoErrorCode(error: unknown): SessionPhotoErrorCode {
  if (error instanceof NormalizeImageError) return error.code;
  if (error instanceof ApiError && isSessionPhotoErrorCode(error.code)) {
    return error.code;
  }
  return "uploadFailed";
}
