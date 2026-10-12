// Two small text measures, done with counting rather than a model, so they
// are fast, free and explainable:
//
//   reviewHighlights: the words several different reviewers of one shop use.
//   textSimilarity:   how alike two texts are, to help a moderator notice a
//                     review that was copied.
//
// ponytail: word counts and word-pair overlap. They do not understand
// meaning, sarcasm or paraphrase. A language model can replace both behind
// the same two functions when one is available.

const STOP = new Set(
  `a an the and or but if so to of in on at for from with by is are was were be been it its this that
  these those i me my we our you your he she they them his her their as not no yes do did does have has
  had will would can could just very too also than then there here got get one two all any some more most
  only about after before into over when what which who how why
  আমি আমার আমরা তুমি আপনি আপনার সে তারা এই ওই এটা এটি সেটা এবং ও আর কিন্তু তবে যে যা না নয় নেই হয় হয়েছে
  হয়নি ছিল ছিলো করে করেছে করা থেকে জন্য দিয়ে নিয়ে পর আগে মধ্যে একটা একটি কি কী খুব আছে হবে তাই
  ami amar tumi apni ei oi ebong ar kintu na nai hoy hoyeche chilo kore theke jonno diye niye ekta ki khub ache`
    .split(/\s+/)
    .filter(Boolean),
);

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(
      (word) => word.length > 2 && !STOP.has(word) && !/^\d+$/.test(word),
    );

export type Highlight = { term: string; reviews: number };

// Terms that appear in at least two different reviews, most widely used
// first. A word one person repeated ten times counts once.
export function reviewHighlights(texts: string[], limit = 8): Highlight[] {
  const seenIn = new Map<string, number>();
  for (const text of texts) {
    for (const word of new Set(words(text))) {
      seenIn.set(word, (seenIn.get(word) ?? 0) + 1);
    }
  }
  return [...seenIn]
    .filter(([, reviews]) => reviews >= 2)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, limit)
    .map(([term, reviews]) => ({ term, reviews }));
}

const pairs = (text: string) => {
  const list = text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i < list.length - 1; i += 1) {
    set.add(`${list[i]} ${list[i + 1]}`);
  }
  // A one-word text is compared by its word.
  if (list.length === 1) set.add(list[0] as string);
  return set;
};

// Overlap of adjacent word pairs, 0 to 1. Punctuation, case and emoji do
// not matter; reworded text scores low on purpose.
export function textSimilarity(a: string, b: string): number {
  const left = pairs(a);
  const right = pairs(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const pair of left) if (right.has(pair)) shared += 1;
  return shared / (left.size + right.size - shared);
}
