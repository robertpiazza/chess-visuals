import { Searcher } from './search.js';

// { fen, maxDepth, timeMs } → posts { type: 'update', depth, lines } after each
// depth, then { type: 'done', depth, lines }.
onmessage = ({ data }) => {
  let depth = 0;
  const lines = new Searcher(data.fen).run({
    maxDepth: data.maxDepth,
    timeMs: data.timeMs,
    onDepth: (d, l) => {
      depth = d;
      postMessage({ type: 'update', depth: d, lines: l });
    },
  });
  postMessage({ type: 'done', depth, lines });
};
