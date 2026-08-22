"use client";

/**
 * `<MascotAvatar>` — a portrait, at whatever size a list row needs.
 *
 * It is a thin wrapper and stays one on purpose: an avatar is the full mascot
 * with the framing fixed to a bust crop, the pose fixed to idle and the motion
 * off. Nothing in a participant list should be animating, and a head-and-
 * shoulders crop of a waving character is a crop of an armpit.
 */

import type { ReactElement } from "react";

import { avatarColors, avatarDetail, avatarFromId, type MascotAvatar } from "./avatar";
import { Mascot } from "./mascot";

export function MascotAvatar({
  avatar,
  size = 40,
  className,
  label,
}: {
  avatar: MascotAvatar;
  size?: number;
  className?: string;
  label?: string;
}): ReactElement {
  return (
    <Mascot
      concept={avatar.concept}
      {...(avatar.form === undefined ? {} : { form: avatar.form })}
      variant={avatar.variant}
      outfit={avatar.outfit}
      colors={avatarColors(avatar)}
      pose="idle"
      expression="happy"
      crop="bust"
      size={size}
      detail={avatarDetail(size)}
      animated={false}
      {...(label === undefined ? {} : { label })}
      {...(className === undefined ? {} : { className })}
    />
  );
}

/** The same thing, from a user id, for anyone who has not customised. */
export function DefaultMascotAvatar({
  userId,
  size = 40,
  className,
  label,
}: {
  userId: string;
  size?: number;
  className?: string;
  label?: string;
}): ReactElement {
  return (
    <MascotAvatar
      avatar={avatarFromId(userId)}
      size={size}
      {...(className === undefined ? {} : { className })}
      {...(label === undefined ? {} : { label })}
    />
  );
}
