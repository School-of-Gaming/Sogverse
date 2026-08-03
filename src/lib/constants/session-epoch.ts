/**
 * The date from which session record-keeping is expected of gedus.
 *
 * Work owed starts at **`max(product start, epoch)`**, so a club that has been
 * running for two years owes nothing for its history: the platform started
 * asking on this date and not before. Compared as a **product-local calendar
 * date** (`YYYY-MM-DD` in the product's own timezone), never as an instant and
 * never in UTC — a session's identity is its local date, so the comparison has
 * to be made in the same terms.
 *
 * **It gates what is *owed*, and nothing else.** A session dated before this
 * never produces a "needs attention" state and never counts toward a dashboard
 * badge, however incomplete its records are. It stays fully recordable: a gedu
 * may take attendance on it, write it up, and edit it, all the way back to the
 * product's start date. That is why the server-side write validation has no
 * epoch floor — only the attention count does.
 *
 * A constant in code on purpose: not a column, not admin-configurable, and not
 * a rolling window. A fixed date is honest about what it is (the day the
 * feature shipped and the expectation began) and needs no reconciliation when
 * anyone edits anything.
 */
export const SESSION_RECORDING_EPOCH = "2026-08-31";
