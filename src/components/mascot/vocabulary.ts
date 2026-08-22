/**
 * The fixed vocabularies a mascot is described with — poses, expressions,
 * held props, and the three roles the fleet has to be able to stand in for.
 *
 * They live in one module rather than beside their renderers because the pose
 * table names a prop, the prop table names a grip, and the exploration page
 * enumerates all four. Splitting them would buy an import cycle and nothing
 * else.
 */

/** How the hands are arranged, which is what decides where a prop can sit. */
export type Grip =
  /** One hand down and free at the character's side. */
  | "side"
  /** Both hands up in front of the chest, holding something between them. */
  | "front"
  /** One hand raised overhead. */
  | "up"
  /** Both hands low and forward, over a surface. */
  | "desk";

export const MASCOT_POSES = [
  "idle",
  "wave",
  "point-left",
  "point-right",
  "hold-up",
  "controller",
  "keyboard-mouse",
  "reading",
  "laptop",
  "walking",
  "jumping",
  "seated",
] as const;
export type PoseId = (typeof MASCOT_POSES)[number];

export const MASCOT_EXPRESSIONS = [
  "happy",
  "excited",
  "thinking",
  "laughing",
  "surprised",
  "focused",
] as const;
export type ExpressionId = (typeof MASCOT_EXPRESSIONS)[number];

export const MASCOT_PROPS = [
  "none",
  "sign",
  "controller",
  "keyboard-mouse",
  "book",
  "laptop",
  "mug",
  "phone",
  "clipboard",
  "pointer",
  "dumbbell",
  "trophy",
] as const;
export type PropId = (typeof MASCOT_PROPS)[number];

/**
 * The stand-in roles. This is the reason the mascot exists rather than a nice
 * extra: the product works with children and never publishes their pictures,
 * so nothing can stand where a child stands in a hero image. A base model that
 * can be dressed as the child, the parent and the educator fills all three
 * holes with one drawing.
 */
export const MASCOT_ROLES = ["none", "gamer", "parent", "gedu"] as const;
export type MascotRole = (typeof MASCOT_ROLES)[number];

export const POSE_LABELS: Record<PoseId, string> = {
  idle: "Idle",
  wave: "Waving",
  "point-left": "Pointing left",
  "point-right": "Pointing right",
  "hold-up": "Holding up",
  controller: "Controller",
  "keyboard-mouse": "Keyboard + mouse",
  reading: "Reading",
  laptop: "Laptop",
  walking: "Walking",
  jumping: "Jumping",
  seated: "Seated at a desk",
};

export const EXPRESSION_LABELS: Record<ExpressionId, string> = {
  happy: "Happy",
  excited: "Excited",
  thinking: "Thinking",
  laughing: "Laughing",
  surprised: "Surprised",
  focused: "Focused",
};

export const PROP_LABELS: Record<PropId, string> = {
  none: "Nothing",
  sign: "Sign",
  controller: "Controller",
  "keyboard-mouse": "Keyboard + mouse",
  book: "Book",
  laptop: "Laptop",
  mug: "Mug",
  phone: "Phone",
  clipboard: "Clipboard",
  pointer: "Pointer",
  dumbbell: "Dumbbell",
  trophy: "Trophy",
};

export const ROLE_LABELS: Record<MascotRole, string> = {
  none: "Plain",
  gamer: "Gamer",
  parent: "Parent",
  gedu: "Gedu",
};

/**
 * What each role puts in the character's hands when nothing else is asked for.
 * A costume without the matching prop reads as half-dressed — a lanyard with
 * empty hands is a person who forgot their clipboard.
 */
export const ROLE_DEFAULT_PROP: Record<MascotRole, PropId> = {
  none: "none",
  gamer: "controller",
  parent: "mug",
  gedu: "clipboard",
};
