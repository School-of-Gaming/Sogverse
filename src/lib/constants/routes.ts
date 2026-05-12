/** Centralized route paths — import and reference instead of hardcoding string literals. */
export const ROUTES = {
  home: "/",
  shop: "/shop",
  clubs: "/clubs",
  camps: "/camps",
  events: "/events",
  yty: "/#yty",
  about: "/#about",
  docs: "/docs",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  setupAccount: "/setup-account",
  selectProfile: "/select-profile",
  help: "/help",
  settings: "/settings",
  /**
   * Public on-the-fly voice room — see docs/instant-voice-rooms.md.
   * `prefix` is the route base used for proxy matching; `forCode` builds
   * the full URL for a given room code.
   */
  voice: {
    prefix: "/voice",
    forCode: (code: string) => `/voice/${code}`,
  },
  admin: {
    dashboard: "/admin",
    users: "/admin/users",
    usersAdd: "/admin/users/add",
    user: (id: string) => `/admin/users/${id}`,
    products: "/admin/products",
    productsAdd: "/admin/products/add",
    product: (id: string) => `/admin/products/${id}`,
    productEdit: (id: string) => `/admin/products/${id}/edit`,
    productClone: (id: string) => `/admin/products/add?clone=${id}`,
    consumerClubs: "/admin/consumer-clubs",
    consumerClubsNew: "/admin/consumer-clubs/new",
    municipalityClubs: "/admin/municipality-clubs",
    municipalityClubsNew: "/admin/municipality-clubs/new",
    camps: "/admin/camps",
    campsNew: "/admin/camps/new",
    events: "/admin/events",
    eventsNew: "/admin/events/new",
    groups: "/admin/groups",
    group: (groupId: string) => `/admin/groups/${groupId}`,
    voiceSession: (roomId: string) => `/admin/voice/${roomId}`,
    voice: "/admin/voice",
    uiComponents: "/admin/ui-components",
    testing: "/admin/testing",
    whatsapp: "/admin/whatsapp",
    locations: "/admin/locations",
  },
  customer: {
    dashboard: "/parent",
    gamers: "/parent/gamers",
    group: (groupId: string, gamerId?: string) =>
      gamerId
        ? `/parent/groups/${groupId}?gamer=${gamerId}`
        : `/parent/groups/${groupId}`,
  },
  gamer: {
    dashboard: "/gamer",
    groups: "/gamer/groups",
    group: (groupId: string) => `/gamer/groups/${groupId}`,
    voiceSession: (roomId: string) => `/gamer/voice/${roomId}`,
  },
  gedu: {
    dashboard: "/gedu",
    groups: "/gedu/groups",
    group: (groupId: string) => `/gedu/groups/${groupId}`,
    voiceSession: (roomId: string) => `/gedu/voice/${roomId}`,
    voice: "/gedu/voice",
  },
} as const;
