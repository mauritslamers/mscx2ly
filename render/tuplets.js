// Tuplet-span detection for mscx2ly's render pipeline.
// See tickets/00-background.md for why this exists.
import { getGraceType } from './graceNotes.js';

/**
 * Walks one voice's filtered event array and returns a NEW array with the
 * Tuplet/endTuplet marker events removed, and every other event annotated with:
 * - tupletRatio: the combined ratio of all enclosing tuplets (null outside any),
 * - tupletOpens: ratios of the tuplets that open on this event, outermost first,
 * - tupletCloses: how many tuplets close after this event.
 * Grace chords never carry opens/closes: they sit outside the tuplet's braces
 * (a tuplet starting on a grace chord opens on the next ordinary event instead).
 *
 * @param {{ name: string, get: (name: string) => any }[]} voiceEvents
 * @returns {{ evt: object, tupletRatio: { actual: number, normal: number } | null, tupletOpens: { actual: number, normal: number }[], tupletCloses: number }[]}
 */
export function annotateTuplets(voiceEvents) {
    const result = [];
    const open = []; // tuplets currently enclosing the cursor, outermost first
    let pendingOpens = [];
    let lastOrdinary = null; // last non-grace annotated event, the one an endTuplet closes on
    const combinedRatio = () => open.length
        ? open.reduce((acc, r) => ({ actual: acc.actual * r.actual, normal: acc.normal * r.normal }), { actual: 1, normal: 1 })
        : null;
    for (const evt of voiceEvents) {
        if (evt.name === 'Tuplet') {
            const actual = parseInt(evt.get('actualNotes'), 10);
            const normal = parseInt(evt.get('normalNotes'), 10);
            const ratio = { actual: actual || 1, normal: normal || 1 };
            open.push(ratio);
            pendingOpens.push(ratio);
            continue;
        }
        if (evt.name === 'endTuplet') {
            if (!open.length) continue;
            if (pendingOpens.length) {
                pendingOpens.pop(); // closed before any member arrived
            } else if (lastOrdinary) {
                lastOrdinary.tupletCloses += 1;
            }
            open.pop();
            continue;
        }
        const entry = { evt, tupletRatio: combinedRatio(), tupletOpens: [], tupletCloses: 0 };
        if (!getGraceType(evt)) {
            entry.tupletOpens = pendingOpens;
            pendingOpens = [];
            lastOrdinary = entry;
        }
        result.push(entry);
    }
    return result;
}
