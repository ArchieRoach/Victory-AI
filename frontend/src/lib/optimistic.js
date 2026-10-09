// Optimistic updates: show the result of a tap straight away, confirm with the server, and
// if the server says no, put the screen back and say so, so nobody is misled about what
// actually happened. Responses under ~100ms feel instant; a round trip usually doesn't.
export async function optimistic({ apply, rollback, request, onError }) {
  apply();
  try {
    return { ok: true, data: await request() };
  } catch (error) {
    rollback();
    onError?.(error);
    return { ok: false, error };
  }
}
