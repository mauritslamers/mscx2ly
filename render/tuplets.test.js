import test from 'ava';
import { annotateTuplets } from './tuplets.js';

const evt = (name, attrs = {}) => ({ name, get: (key) => attrs[key] ?? null });
const tuplet = (actual, normal) => evt('Tuplet', { actualNotes: String(actual), normalNotes: String(normal) });

test('annotateTuplets: no tuplet markers -> every event unannotated', t => {
    const events = [evt('Chord'), evt('Rest'), evt('Chord')];
    const result = annotateTuplets(events);
    t.is(result.length, 3);
    result.forEach(r => {
        t.is(r.tupletRatio, null);
        t.deepEqual(r.tupletOpens, []);
        t.is(r.tupletCloses, 0);
    });
});

test('annotateTuplets: a standard eighth-note triplet opens on the first event and closes on the last', t => {
    const events = [tuplet(3, 2), evt('Chord'), evt('Chord'), evt('Chord'), evt('endTuplet')];
    const result = annotateTuplets(events);
    t.is(result.length, 3, 'Tuplet/endTuplet markers themselves are removed');
    t.deepEqual(result[0].tupletRatio, { actual: 3, normal: 2 });
    t.deepEqual(result.map(r => r.tupletOpens.length), [1, 0, 0]);
    t.deepEqual(result.map(r => r.tupletCloses), [0, 0, 1]);
});

test('annotateTuplets: events before and after a tuplet are unannotated', t => {
    const events = [evt('Rest'), tuplet(3, 2), evt('Chord'), evt('Chord'), evt('Chord'), evt('endTuplet'), evt('Rest')];
    const result = annotateTuplets(events);
    t.is(result.length, 5);
    t.is(result[0].tupletRatio, null);
    t.is(result[4].tupletRatio, null);
});

test('annotateTuplets: a one-event tuplet opens and closes on that event', t => {
    const result = annotateTuplets([tuplet(3, 2), evt('Chord'), evt('endTuplet'), evt('Chord')]);
    t.is(result[0].tupletOpens.length, 1);
    t.is(result[0].tupletCloses, 1);
    t.is(result[1].tupletOpens.length, 0);
    t.is(result[1].tupletCloses, 0);
});

test('annotateTuplets: nested tuplets are balanced and carry the combined ratio', t => {
    const result = annotateTuplets([
        tuplet(3, 2), evt('Chord'),
        tuplet(5, 4), evt('Chord'), evt('Chord'), evt('endTuplet'),
        evt('Chord'), evt('endTuplet'),
        evt('Rest'),
    ]);
    t.is(result.length, 5);
    t.deepEqual(result[1].tupletRatio, { actual: 15, normal: 8 });
    t.deepEqual(result[0].tupletRatio, { actual: 3, normal: 2 });
    t.is(result[1].tupletOpens.length, 1);
    t.is(result[2].tupletCloses, 1, 'inner tuplet closes on its last event');
    t.is(result[3].tupletCloses, 1, 'outer tuplet closes on its last event');
    const opens = result.reduce((n, r) => n + r.tupletOpens.length, 0);
    const closes = result.reduce((n, r) => n + r.tupletCloses, 0);
    t.is(opens, closes);
});

test('annotateTuplets: a tuplet starting on a grace chord opens on the next ordinary event', t => {
    const grace = { name: 'Chord', get: (key) => (key === 'acciaccatura' ? true : null) };
    const result = annotateTuplets([tuplet(3, 2), grace, evt('Chord'), evt('Chord'), evt('Chord'), evt('endTuplet')]);
    t.is(result[0].tupletOpens.length, 0, 'grace chord stays outside the tuplet braces');
    t.is(result[1].tupletOpens.length, 1);
    t.is(result[3].tupletCloses, 1);
});

test('annotateTuplets: an unmatched endTuplet is ignored', t => {
    const result = annotateTuplets([evt('Chord'), evt('endTuplet'), evt('Chord')]);
    t.is(result.reduce((n, r) => n + r.tupletCloses, 0), 0);
});
