// "What kind of fighter are you?": a 6-question style quiz anyone can take before signing up.
// Goal: get people who've never opened the app to try it, and give them something to share.
// Psychology: identity expression (people adopt and share labels that describe them) and
//   curiosity; a result about *you* is shared far more than a score.
// Design: no sign-up, no data stored until they choose to join; the result names a style,
//   a legend who fought that way and the three skills that style lives on, then offers to
//   build training around it.

export const STYLES = {
  pressure: {
    name: "Pressure Fighter", legend: "Joe Frazier",
    blurb: "You walk them down, cut the ring and make every round a fight. Opponents feel you all night.",
    focus: ["Head Movement", "Body Movement", "Combination Flow"],
    gap: "Footwork: pressure only works if you cut off the ring instead of following them.",
  },
  outboxer: {
    name: "Outside Fighter", legend: "Muhammad Ali",
    blurb: "You control distance, live behind the jab and make them fight at your range.",
    focus: ["Jab", "Footwork", "Ring Generalship"],
    gap: "Guard Position: long range is safe until they close it, so your hands must stay home.",
  },
  counter: {
    name: "Counter Puncher", legend: "Pernell Whitaker",
    blurb: "You make them miss and make them pay. Patience is your weapon.",
    focus: ["Slip", "Parry", "Punch Accuracy"],
    gap: "Combination Flow: counters land harder when the second and third shots follow.",
  },
  power: {
    name: "Power Puncher", legend: "Mike Tyson",
    blurb: "Explosive and dangerous from the first bell. One clean shot changes everything.",
    focus: ["Left Hook", "Uppercut", "Roll"],
    gap: "Jab: power needs a way in, and the jab is the door.",
  },
  combo: {
    name: "Combination Artist", legend: "Manny Pacquiao",
    blurb: "Speed, angles and volume. You punch in bunches and they never see the last one.",
    focus: ["Combination Flow", "Footwork", "Punch Balance"],
    gap: "Guard Position: you're open at the end of combinations. Finish behind your hands.",
  },
  boxerpuncher: {
    name: "Boxer-Puncher", legend: "Sugar Ray Leonard",
    blurb: "You can box or brawl, and you know which one the round needs.",
    focus: ["Ring Generalship", "Cross", "Combination Flow"],
    gap: "Head Movement: versatility is dangerous when you're also hard to hit.",
  },
};

export const QUESTIONS = [
  {
    q: "The bell rings. You…",
    a: [["Walk them down and cut off the ring", { pressure: 2 }], ["Circle and pop the jab", { outboxer: 2 }],
        ["Wait for them to make the first mistake", { counter: 2 }], ["Look to land something big early", { power: 2 }]],
  },
  {
    q: "Your favourite punch?",
    a: [["The jab", { outboxer: 2, boxerpuncher: 1 }], ["Left hook to the body", { pressure: 2 }],
        ["The right hand after a slip", { counter: 2 }], ["The uppercut", { power: 2 }], ["A five-punch combination", { combo: 2 }]],
  },
  {
    q: "They throw a jab at you. You…",
    a: [["Slip it and counter", { counter: 2 }], ["Step back out of range", { outboxer: 2 }],
        ["Roll under and come forward", { pressure: 1, power: 1 }], ["Parry it and fire back a combination", { combo: 1, boxerpuncher: 1 }]],
  },
  {
    q: "What wins fights?",
    a: [["Ring IQ", { boxerpuncher: 2, outboxer: 1 }], ["Volume", { combo: 2, pressure: 1 }],
        ["One clean shot", { power: 2 }], ["Not getting hit", { counter: 2 }]],
  },
  {
    q: "The session you'd never skip:",
    a: [["Footwork and shadow boxing", { outboxer: 2 }], ["Power rounds on the heavy bag", { power: 2 }],
        ["Combinations on the pads", { combo: 2 }], ["Defence drills and sparring", { counter: 2 }], ["Conditioning until you drop", { pressure: 2 }]],
  },
  {
    q: "Last round, you're behind on the cards. You…",
    a: [["Go for the knockout", { power: 2 }], ["Throw everything you've got", { combo: 1, pressure: 1 }],
        ["Box smart and steal it with the jab", { boxerpuncher: 2 }], ["Bait them in and counter", { counter: 2 }]],
  },
];

const ORDER = Object.keys(STYLES);

export function scoreStyle(answers) {
  const totals = Object.fromEntries(ORDER.map((k) => [k, 0]));
  answers.forEach((choice, i) => {
    const weights = QUESTIONS[i]?.a[choice]?.[1] || {};
    Object.entries(weights).forEach(([k, w]) => { totals[k] += w; });
  });
  return ORDER.reduce((best, k) => (totals[k] > totals[best] ? k : best), ORDER[0]);
}

export function styleShareText(key) {
  const s = STYLES[key];
  return s ? `I'm ${withArticle(s.name)}, like ${s.legend}. What kind of fighter are you?` : "What kind of fighter are you?";
}

export const STYLE_STORAGE_KEY = "victory_fighter_style";

export function withArticle(name) {
  return `${/^[AEIOU]/i.test(name) ? "an" : "a"} ${name}`;
}
