// Grace-note detection for mscx2ly's render pipeline.
// MuseScore marks a grace note with an empty presence-only child element on
// its <Chord> (e.g. <Chord><durationType>eighth</durationType><acciaccatura/>
// ...), a sibling event in the voice stream, not a modifier nested inside the
// main note it precedes. Confirmed against
// tests/tchaikovski_symp5_finale_mscore_4.7.mscz (snare drum, bar 135) and
// MuseScore's own read/write source (rw/read460/tread.cpp, rw/write/twrite.cpp).

// "Before" grace types map onto LilyPond's own grace commands. The three
// GRACE* sizes only differ in how small MuseScore prints them, not in kind,
// so they all collapse to LilyPond's plain (unslashed) \grace.
const graceCommands = {
    acciaccatura: '\\acciaccatura',
    appoggiatura: '\\appoggiatura',
    grace4: '\\grace',
    grace16: '\\grace',
    grace32: '\\grace',
};

// "After" grace types (played after the main note, e.g. a turn at a phrase's
// end) aren't supported yet — LilyPond expresses these structurally via
// \afterGrace mainNote { graceNotes }, wrapping the *preceding* note, which
// this event-at-a-time renderer isn't set up for. Render as a plain \grace
// (audible pitch preserved, bar-check duration correct) rather than silently
// dropping the note or leaving it as a full-duration normal note.
const afterGraceTypes = ['grace8after', 'grace16after', 'grace32after'];

const graceMarkers = [...Object.keys(graceCommands), ...afterGraceTypes];

/**
 * @param {{ name: string, get: (name: string) => any }} chordEvt
 * @returns {string | null} the grace marker name (e.g. "acciaccatura"), or null
 */
export function getGraceType(chordEvt) {
    if (chordEvt.name !== 'Chord') return null;
    for (const marker of graceMarkers) {
        if (chordEvt.get(marker)) return marker;
    }
    return null;
}

/**
 * @param {string} graceType
 * @returns {string} the LilyPond command to wrap this grace note/run in
 */
export function graceCommandFor(graceType) {
    if (afterGraceTypes.includes(graceType)) {
        console.warn(`[mscx2ly] "after" grace notes (${graceType}) are not placed after their main note yet; rendering as a plain grace note instead`);
        return '\\grace';
    }
    return graceCommands[graceType] || '\\grace';
}

/**
 * Walks an already-annotated event array (anything with an `.evt` per entry,
 * e.g. annotateTuplets' output) and marks consecutive runs of same-type grace
 * Chords with graceGroupStart/graceGroupEnd, so the renderer can wrap a whole
 * run in one \acciaccatura { ... } block instead of one per note.
 *
 * @param {{ evt: object }[]} annotatedEvents
 * @returns {({ evt: object, graceType: string | null, graceGroupStart: boolean, graceGroupEnd: boolean })[]}
 */
export function annotateGraceNotes(annotatedEvents) {
    const result = [];
    let i = 0;
    while (i < annotatedEvents.length) {
        const graceType = getGraceType(annotatedEvents[i].evt);
        if (!graceType) {
            result.push({ ...annotatedEvents[i], graceType: null, graceGroupStart: false, graceGroupEnd: false });
            i += 1;
            continue;
        }
        let j = i;
        while (j < annotatedEvents.length && getGraceType(annotatedEvents[j].evt) === graceType) {
            j += 1;
        }
        for (let k = i; k < j; k++) {
            result.push({ ...annotatedEvents[k], graceType, graceGroupStart: k === i, graceGroupEnd: k === j - 1 });
        }
        i = j;
    }
    return result;
}
