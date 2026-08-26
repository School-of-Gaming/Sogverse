// The seat offer: an admin invites one waitlisted family to a seat that has
// opened, and they answer yes or no from their inbox or from My SOG.

/**
 * How long a family has to answer a seat offer, in days.
 *
 * **This number exists twice, on purpose, and the two copies are in lockstep.**
 * The database needs it to decide whether an offer is still live (the
 * `interval '5 days'` in `send_seat_offer`, `respond_seat_offer` and
 * `claim_expired_seat_offer_notifications`), and TypeScript needs it to derive
 * the absolute deadline the mail and the landing page state, and to expire a
 * token without a round trip. Neither end can read the other's, so both carry
 * the literal and both carry a comment naming its twin — the same arrangement
 * `effective_status` uses for the window it shares with the UI.
 *
 * **Changing it is a two-file edit**: this constant and a migration that
 * recreates all three functions with the new interval. A change made in one
 * place alone is silent — the token would outlive the row's own window, or die
 * before it — so the db tests that assert the two agree are the thing to read
 * next if this ever moves. They come as a **pair**, and both halves are load
 * bearing: one answers just past the deadline and must be refused, the other
 * answers just short of it and must be honoured. Either alone bounds the SQL
 * interval from one side only, and a window silently shortened to four days
 * passes a test that checks nothing but expiry.
 *
 * Five days is the owner's choice: long enough that a family who checks their
 * mail at the weekend still answers, short enough that a seat is not held out
 * of circulation for a fortnight while another family waits behind them.
 */
export const SEAT_OFFER_WINDOW_DAYS = 5;

/** The same window in milliseconds, for token expiry and deadline arithmetic. */
export const SEAT_OFFER_WINDOW_MS = SEAT_OFFER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
