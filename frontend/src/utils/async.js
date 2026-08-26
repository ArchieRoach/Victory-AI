// Ensures a loading/busy state stays visible for at least `ms` — real work
// finishing faster than that would otherwise flash the spinner imperceptibly,
// which reads as broken rather than as work having genuinely happened. This
// never slows down real work beyond the floor: if the request already takes
// longer than `ms`, this resolves the instant it finishes.
export const withMinDuration = (promise, ms = 500) =>
  Promise.all([promise, new Promise((resolve) => setTimeout(resolve, ms))]).then(([result]) => result);
