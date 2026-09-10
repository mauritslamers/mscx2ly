// Tuplet-span detection for mscx2ly's render pipeline.
// See tickets/00-background.md for why this exists.

/**
 * Walks one voice's filtered event array and returns a NEW array with the
 * Tuplet/endTuplet marker events removed, and every other event annotated
 * with the tuplet ratio it belongs to, if any — or null if not inside a tuplet.
 *
 * @param {{ name: string, get: (name: string) => any }[]} voiceEvents
 * @returns {{ evt: object, tupletRatio: { actual: number, normal: number } | null, tupletPosition: 'start' | 'middle' | 'end' | null }[]}
 */
export function annotateTuplets(voiceEvents) {
    const result = [];
    let current = null; // { actual, normal, memberCount }
    for (const evt of voiceEvents) {
        if (evt.name === 'Tuplet') {
            if (current) {
                console.warn('[mscx2ly] Nested tuplets are not supported; closing the outer tuplet early');
            }
            const actual = parseInt(evt.get('actualNotes'), 10);
            const normal = parseInt(evt.get('normalNotes'), 10);
            current = { actual: actual || 1, normal: normal || 1, memberCount: 0 };
            continue;
        }
        if (evt.name === 'endTuplet') {
            if (current && result.length > 0) {
                result[result.length - 1].tupletPosition = 'end';
            }
            current = null;
            continue;
        }
        if (current) {
            current.memberCount += 1;
            result.push({
                evt,
                tupletRatio: { actual: current.actual, normal: current.normal },
                tupletPosition: current.memberCount === 1 ? 'start' : 'middle',
            });
        } else {
            result.push({ evt, tupletRatio: null, tupletPosition: null });
        }
    }
    return result;
}