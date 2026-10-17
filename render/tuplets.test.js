import test from 'ava';
import { annotateTuplets } from './tuplets.js';

const evt = (name, attrs = {}) => ({ name, get: (key) => attrs[key] ?? null });

test('annotateTuplets: no tuplet markers -> every event unannotated', t => {
    const events = [evt('Chord'), evt('Rest'), evt('Chord')];
    const result = annotateTuplets(events);
    t.is(result.length, 3);
    result.forEach(r => {
        t.is(r.tupletRatio, null);
        t.is(r.tupletPosition, null);
    });
});

test('annotateTuplets: a standard eighth-note triplet is annotated start/middle/end', t => {
    const events = [
        evt('Tuplet', { actualNotes: '3', normalNotes: '2' }),
        evt('Chord'),
        evt('Chord'),
        evt('Chord'),
        evt('endTuplet'),
    ];
    const result = annotateTuplets(events);
    t.is(result.length, 3, 'Tuplet/endTuplet markers themselves are removed');
    t.deepEqual(result[0].tupletRatio, { actual: 3, normal: 2 });
    t.is(result[0].tupletPosition, 'start');
    t.is(result[1].tupletPosition, 'middle');
    t.is(result[2].tupletPosition, 'end');
});

test('annotateTuplets: events before and after a tuplet are unannotated', t => {
    const events = [
        evt('Rest'),
        evt('Tuplet', { actualNotes: '3', normalNotes: '2' }),
        evt('Chord'),
        evt('Chord'),
        evt('Chord'),
        evt('endTuplet'),
        evt('Rest'),
    ];
    const result = annotateTuplets(events);
    t.is(result.length, 5);
    t.is(result[0].tupletRatio, null);
    t.is(result[4].tupletRatio, null);
});

test('annotateTuplets: a nested Tuplet marker warns and does not throw', t => {
    const events = [
        evt('Tuplet', { actualNotes: '3', normalNotes: '2' }),
        evt('Chord'),
        evt('Tuplet', { actualNotes: '5', normalNotes: '4' }),
        evt('Chord'),
        evt('endTuplet'),
    ];
    t.notThrows(() => annotateTuplets(events));
});
test('annotateTuplets: a one-event tuplet is annotated single, not overwritten with end', t => {
    const result = annotateTuplets([
        evt('Tuplet', { actualNotes: '3', normalNotes: '2' }),
        evt('Chord'),
        evt('endTuplet'),
        evt('Chord'),
    ]);
    t.is(result[0].tupletPosition, 'single');
    t.is(result[1].tupletPosition, null);
});
