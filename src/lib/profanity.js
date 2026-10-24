// Bad-word checks for the Shelf's free text, using obscenity's English list.
// Its transformers also catch the usual dodges ("sh1t", "fuuuck", lookalike
// letters), while leaving words like "Scunthorpe" or "Dickens" alone.
import {
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
  keepStartCensorStrategy,
} from "obscenity";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// "shit" -> "s***"
const censor = new TextCensor().setStrategy(keepStartCensorStrategy(asteriskCensorStrategy()));

export const hasBadWords = (text) => !!text && matcher.hasMatch(text);

// The text with any bad words masked; unchanged if there are none.
export function maskBadWords(text) {
  if (!text) return text;
  const matches = matcher.getAllMatches(text);
  return matches.length ? censor.applyTo(text, matches) : text;
}
