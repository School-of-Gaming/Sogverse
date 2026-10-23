/**
 * The answers to a whole generated case list, asked of the database a few at
 * a time rather than all at once.
 *
 * A DB test that holds one half of a rule equal to the other on every case
 * makes one request per case, and the lists run to over a hundred. Fired
 * together, every request opens its own connection to the local API (no
 * kept-alive one is free yet) and every one past PostgREST's pool waits in its
 * queue, so the test's time is set by how fast a freshly built stack opens a
 * hundred sockets and its first database sessions — fine on an idle machine,
 * past the test's budget on a busy one. A few at a time, the same handful of
 * connections is reused for the whole list and no request ever queues for a
 * database session, so the time is the list's length times one ordinary
 * round trip. Answers come back in the order of `items`.
 */
const AT_ONCE = 4;

export async function inTurn<Item, Answer>(
  items: readonly Item[],
  ask: (item: Item) => PromiseLike<Answer>,
): Promise<Answer[]> {
  const answers: Answer[] = new Array<Answer>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      answers[index] = await ask(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, worker));
  return answers;
}
