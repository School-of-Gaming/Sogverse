"use client";

import { useId, type ReactNode } from "react";
import {
  DayLabel,
  MonthHeading,
  startsMonth,
} from "@/components/admin/day-label";
import type { SubstitutionRequest } from "./admin-substitutions-data";

/**
 * Requests grouped by the day their session falls on, soonest day first, each
 * day a label in a column beside its requests — the dashboard's Coming up feed
 * drawn over this page's cards, so the order a reader scans is legible without
 * reading a date off every card.
 *
 * **The day is the request's own calendar date, never a resolved instant.** An
 * orphaned request has no start, and it still has a day; grouping on an
 * instant would have nowhere to put it.
 *
 * **Within a day the list keeps the order it was handed**, which is
 * soonest-start-first; this component only groups. The days themselves are
 * ordered by date here rather than trusted to arrive in runs, because a list
 * sorted by instant can interleave two dates: a session just after midnight in
 * one zone can start before a late-evening one on the previous date in another.
 */
export function SubstitutionDayList({
  requests,
  label,
  renderRequest,
}: {
  /** Sorted soonest-first; grouping keeps that order inside each day. */
  requests: readonly SubstitutionRequest[];
  /** The list's accessible name — the heading that introduces it. */
  label: string;
  /** One request's card. */
  renderRequest: (request: SubstitutionRequest) => ReactNode;
}) {
  const days = groupByDay(requests);
  const dates = days.map((day) => day.date);

  return (
    <ul aria-label={label} className="space-y-4">
      {days.map((day, index) => (
        <li key={day.date}>
          {startsMonth(dates, index) && <MonthHeading date={day.date} />}
          <DayRow
            date={day.date}
            requests={day.requests}
            renderRequest={renderRequest}
          />
        </li>
      ))}
    </ul>
  );
}

function DayRow({
  date,
  requests,
  renderRequest,
}: {
  date: string;
  requests: readonly SubstitutionRequest[];
  renderRequest: (request: SubstitutionRequest) => ReactNode;
}) {
  const labelId = useId();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
      {/* Beside the cards, the label drops to the first line of text inside
          the card rather than sitting on its border. */}
      <DayLabel date={date} id={labelId} className="sm:pt-5" />
      <ul aria-labelledby={labelId} className="min-w-0 flex-1 space-y-3">
        {requests.map((request) => (
          <li key={request.id}>{renderRequest(request)}</li>
        ))}
      </ul>
    </div>
  );
}

/** The requests bucketed by day, days in date order, each day's in list order. */
function groupByDay(
  requests: readonly SubstitutionRequest[],
): { date: string; requests: SubstitutionRequest[] }[] {
  const byDay = new Map<string, SubstitutionRequest[]>();
  for (const request of requests) {
    const bucket = byDay.get(request.sessionDay);
    if (bucket === undefined) byDay.set(request.sessionDay, [request]);
    else bucket.push(request);
  }
  // `YYYY-MM-DD` sorts as a string in date order.
  return [...byDay]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, bucket]) => ({ date, requests: bucket }));
}
