# Customer Enrollment Architecture

> **This doc described the legacy Sorg-token enrollment flow, which was removed
> in the migration `00059_drop_sorg_tokens.sql`. The current customer purchase /
> enrollment system uses Products v2: see `docs/products-redesign.md` for the
> architecture and `docs/products-v2-architecture.md` for the component map.**

The legacy `group_enrollments`, `product_groups`, `voice_rooms`, and
`get_my_groups` machinery remains in place — it still backs the group-detail
and voice-chat UIs — but the token-based billing layer
(`enrollment_charges`, `enroll_gamer_in_group`, `unenroll_gamer`,
`adjust_token_balance`, the weekly charge cron, the refund logic) is gone.
The whole v1 product/group/enrollment stack is scheduled for removal at v2
cutover (`docs/products-redesign.md` § "Drop-old migration").
