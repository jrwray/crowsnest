import { safeFetch } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE & FUN FACT
// ─────────────────────────────────────────────────────────────────────────────

const quoteEl = document.getElementById('quote');
const funFactEl = document.getElementById('fun-fact');
const LOCAL_QUOTES = [
  ["The best way to predict the future is to invent it.", "Alan Kay"],
  ["Talk is cheap. Show me the code.", "Linus Torvalds"],
  ["Premature optimization is the root of all evil.", "Donald Knuth"],
  ["First, solve the problem. Then, write the code.", "John Johnson"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
  ["Programs must be written for people to read.", "Harold Abelson"],
  ["Simplicity is the soul of efficiency.", "Austin Freeman"],
  ["Code is like humor. When you have to explain it, it's bad.", "Cory House"],
  ["Done is better than perfect.", "Sheryl Sandberg"],
  ["Stay hungry, stay foolish.", "Stewart Brand"],
  ["The obstacle is the way.", "Marcus Aurelius"],
  ["We suffer more in imagination than in reality.", "Seneca"],
  ["Luck is what happens when preparation meets opportunity.", "Seneca"],
  ["Discipline equals freedom.", "Jocko Willink"],
  ["Fortune favors the bold.", "Virgil"],
  ["You miss 100% of the shots you don't take.", "Wayne Gretzky"],
  ["Amateurs wait for inspiration; the rest of us get to work.", "Stephen King"],
  ["Well done is better than well said.", "Benjamin Franklin"],
  ["Quality is not an act, it is a habit.", "Aristotle"],
  ["Whether you think you can or you can't, you're right.", "Henry Ford"],
  ["In the middle of difficulty lies opportunity.", "Albert Einstein"],
  ["The market can stay irrational longer than you can stay solvent.", "John M. Keynes"],
  ["Risk comes from not knowing what you're doing.", "Warren Buffett"],
  ["Be fearful when others are greedy, and greedy when others are fearful.", "Warren Buffett"],
  ["Every battle is won before it is fought.", "Sun Tzu"],
  ["What gets measured gets managed.", "Peter Drucker"],
  ["The man who moves a mountain begins by carrying small stones.", "Confucius"],
  ["Action is the foundational key to all success.", "Pablo Picasso"]
];

export async function getQuote() {
  const [lq, la] = LOCAL_QUOTES[Math.floor(Math.random() * LOCAL_QUOTES.length)];
  quoteEl.textContent = `"${lq}" — ${la}`;   // always show something
  try {
    const [item] = await safeFetch('https://zenquotes.io/api/random');
    if (item?.q && item.q.length < 240 && !/too many requests/i.test(item.q)) {
      quoteEl.textContent = `"${item.q}" — ${item.a}`;
    }
  } catch { /* keep the local quote */ }
}
export async function getFunFact() {
  try { const data = await safeFetch('https://uselessfacts.jsph.pl/random.json?language=en');
    funFactEl.textContent = data?.text ?? ''; } catch { funFactEl.textContent = ''; }
}
