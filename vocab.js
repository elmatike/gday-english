// Cobertura de vocabulario: qué parte de las palabras de un video ya sabés.
// La extensión (extension/content.js) hace la misma cuenta: si cambiás algo acá, cambialo también allá.
//
// Cuenta todas las palabras que se dicen (si "you" aparece 200 veces, cuenta 200), sin nombres propios ni números.
// Una palabra cuenta como sabida si está entre las ~300 más comunes del inglés hablado (the, you, going...)
// o si la sabés en G'day: la marcaste "Ya la sé" o FSRS calcula que la recordás por 3 semanas o más.

export const MIN_HOURS = 5;      // antes de esto todavía no hay suficientes palabras marcadas para que el número diga algo
export const EASY = 0.8, HARD = 0.55;

export const BASIC = new Set(`a about above after again against all almost alone along already also always am an and another any anybody anyone anything anyway are aren't around as ask asked at away back bad be because been before being below best better between big both but by call called came can can't cannot come comes coming could couldn't day did didn't do does doesn't doing don't done down each else even ever every everybody everyone everything few find first for from get gets getting give go goes going gone gonna good got gotta great guy guys had hadn't has hasn't have haven't having he he'd he'll he's hear hello help her here hers herself hey hi him himself his hmm how i i'd i'll i'm i've if in into is isn't it it's its itself just keep kind know known last leave let let's life like little long look looking lot made make man many may maybe me mean men might mine more most mr mrs much must my myself need never new next nice no nobody none nor not nothing now of off oh ok okay old on once one only or other our ours ourselves out over own people place please put really right said same saw say says see seen she she'd she'll she's should shouldn't so some somebody someone something sorry still stuff such sure take talk tell than thank thanks that that's the their theirs them themselves then there there's these they they'd they'll they're they've thing things think this those though thought through time to today together told too tonight try trying two uh um under until up upon us very wait want wanted wanna was wasn't way we we'd we'll we're we've well went were weren't what what's when where where's whether which while who who's whole whom why will with without woman won't work would wouldn't yeah yes yet you you'd you'll you're you've your yours yourself yourselves`.split(' '));

const tok = w => w.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');

// texts: las líneas del subtítulo. isKnown(palabra en minúscula) dice si la sabés.
export function coverage(texts, isKnown) {
  const toks = [], lower = new Set();
  for (const line of texts) {
    const clean = String(line).replace(/\[[^\]]*\]|\([^)]*\)|♪/g, ' ');
    for (const raw of clean.split(/\s+/)) {
      const w = tok(raw);
      if (!w || /\d/.test(w) || !/[a-z]/.test(w)) continue;
      if (/^[^A-Za-z]*[a-z]/.test(raw)) lower.add(w);
      toks.push([w, /^[^A-Za-z]*[A-Z]/.test(raw)]);
    }
  }
  let n = 0, ok = 0;
  for (const [w, cap] of toks) {
    if (cap && !lower.has(w) && w !== 'i' && !BASIC.has(w)) continue;  // nunca aparece en minúscula: es un nombre (Bluey, Sydney)
    n++;
    if (BASIC.has(w) || isKnown(w)) ok++;
  }
  return { pct: n ? ok / n : 0, n };
}

export function coverageMsg(pct) {
  const p = Math.round(pct * 100);
  if (pct > EASY) return { p, kind: 'easy', text: `Sabés el ${p}% de las palabras de este video. Es muy fácil para vos: te conviene uno más difícil para seguir aprendiendo.` };
  if (pct < HARD) return { p, kind: 'hard', text: `Sabés el ${p}% de las palabras de este video. Es muy difícil para vos: te conviene uno más fácil.` };
  return { p, kind: 'ok', text: `Sabés el ${p}% de las palabras de este video. Está bien para tu nivel.` };
}
