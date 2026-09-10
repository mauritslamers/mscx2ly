// Detects MuseScore's repeat/volta (1st/2nd/... ending) structure and applies
// it to a staff's rendered per-measure LilyPond text as \repeat volta { }
// \alternative { } blocks — see tickets/B01-repeat-barlines-not-converted.md
// for the investigation this is based on.
//
// Ground truth (confirmed against tests/repeats.mscz, both the raw MuseScore
// XML and the real MuseScore-rendered PDF):
// - `startRepeat`/`endRepeat` live on <Measure>, not the voice event stream.
// - A volta ending's start is a voice-level <Spanner type="Volta"> that has a
//   <Volta> child (carrying `endings`, the ending number, and `next.location
//   .measures`, its span in measures); its close is a later <Spanner
//   type="Volta"> with only a <prev>, which carries no new information and
//   can be ignored — the span length already tells us where it ends.
// - `endRepeat` is present on every ending in a volta group except the last
//   (highest-numbered) one; its own value is not the true repeat count when
//   voltas are involved (MuseScore was observed to leave it at "2" even for
//   a 3-ending group) — the true count is the last ending's `endings` number.
// - MuseScore only stores these markers on one staff per system (confirmed:
//   only the treble staff of a piano grand staff carried them, the bass
//   staff had none) even though the barline spans every staff — callers
//   must merge markers across all staves by measure index before calling
//   analyzeRepeats, and apply the result to every staff uniformly.

/**
 * Finds a volta-ending start among a measure's already-filtered voice event
 * arrays (the `voice` field produced by `readStaffInfo`), if any.
 * @param {Array<Array<XmlWrapper>>} filteredVoices
 * @returns {{ endings: number, span: number } | null}
 */
export const findVoltaStart = (filteredVoices) => {
    for (const voice of filteredVoices) {
        for (const child of voice) {
            if (child.name !== 'Spanner' || child.get('type') !== 'Volta') continue;
            const volta = child.get('Volta');
            if (!volta) continue; // a <prev>-only closing marker, not a start
            const endings = parseInt(volta.get('endings'), 10);
            const next = child.get('next');
            const span = next ? parseInt(next.get('location').get('measures'), 10) || 1 : 1;
            if (endings) return { endings, span };
        }
    }
    return null;
};

/**
 * Merges per-staff measure markers (startRepeat/endRepeat/voltaStart, as
 * produced by `readStaffInfo`) into one score-wide list by measure index,
 * since MuseScore may only store them on one staff of a system.
 * @param {Array<Array<{startRepeat: boolean, endRepeat: ?string, voltaStart: ?object}>>} staffMeasureLists
 */
export const mergeRepeatMarkers = (staffMeasureLists) => {
    const count = staffMeasureLists.reduce((max, list) => Math.max(max, list.length), 0);
    const markers = [];
    for (let i = 0; i < count; i++) {
        let startRepeat = false;
        let endRepeat = null;
        let voltaStart = null;
        for (const measures of staffMeasureLists) {
            const m = measures[i];
            if (!m) continue;
            if (m.startRepeat) startRepeat = true;
            if (m.endRepeat && !endRepeat) endRepeat = m.endRepeat;
            if (m.voltaStart && !voltaStart) voltaStart = m.voltaStart;
        }
        markers.push({ startRepeat, endRepeat, voltaStart });
    }
    return markers;
};

/**
 * Turns merged per-measure markers into an ordered list of repeat regions,
 * expressed purely as measure-index ranges (independent of any staff's
 * rendered text).
 * @param {ReturnType<typeof mergeRepeatMarkers>} markers
 * @returns {Array<{startIndex: number, bodyEndIndex: number, count: number, endings: ?Array<{startIndex: number, endIndex: number, number: number}>}>}
 */
export const analyzeRepeats = (markers) => {
    const regions = [];
    let bodyStart = 0;
    let i = 0;
    while (i < markers.length) {
        const marker = markers[i];
        if (marker.startRepeat) {
            bodyStart = i;
        }
        if (marker.voltaStart) {
            const endings = [];
            let idx = i;
            let spanEnd = idx;
            for (;;) {
                const span = markers[idx].voltaStart.span || 1;
                spanEnd = idx + span - 1;
                const number = markers[idx].voltaStart.endings;
                const hasEndRepeat = markers.slice(idx, spanEnd + 1).some(m => m.endRepeat);
                endings.push({ startIndex: idx, endIndex: spanEnd, number });
                if (!hasEndRepeat) break; // the last ending in the group carries no endRepeat
                idx = spanEnd + 1;
                if (idx >= markers.length || !markers[idx].voltaStart) break;
            }
            regions.push({
                startIndex: bodyStart,
                bodyEndIndex: endings[0].startIndex - 1,
                count: endings[endings.length - 1].number,
                endings,
            });
            i = spanEnd + 1;
            bodyStart = i;
            continue;
        }
        if (marker.endRepeat) {
            regions.push({
                startIndex: bodyStart,
                bodyEndIndex: i,
                count: parseInt(marker.endRepeat, 10),
                endings: null,
            });
            i += 1;
            bodyStart = i;
            continue;
        }
        i += 1;
    }
    return regions;
};

/**
 * Wraps a staff's flat per-measure LilyPond strings in \repeat volta { }
 * \alternative { } blocks per the given regions. Applied the same way to
 * every staff regardless of its own content (e.g. a rest-only piano left
 * hand) since the repeat structure spans the whole system.
 * @param {string[]} measures
 * @param {ReturnType<typeof analyzeRepeats>} regions
 */
export const applyRepeats = (measures, regions) => {
    if (!regions.length) return measures;
    const out = [...measures];
    const consumed = new Set();
    for (const region of regions) {
        out[region.startIndex] = `\\repeat volta ${region.count} {\n    ${out[region.startIndex]}`;
        if (!region.endings) {
            out[region.bodyEndIndex] = `${out[region.bodyEndIndex]}\n  }`;
            continue;
        }
        // The caller normally stitches the per-measure array together with a
        // bar-check (`|`) between every element; a stray `|` landing directly
        // inside \alternative's own braces (between its { } children) makes
        // LilyPond silently drop every ending but the first. So the whole
        // \alternative block is built here as one self-contained string
        // (using the *original* measures, since `out` may already be mutated
        // at region.bodyEndIndex) and the per-measure slots it replaces are
        // dropped from the array entirely rather than left for the caller's
        // join to mangle.
        const altBlocks = region.endings.map((ending) => {
            const endingMeasures = measures.slice(ending.startIndex, ending.endIndex + 1);
            return `    { ${endingMeasures.join(' |\n      ')} }`;
        });
        out[region.bodyEndIndex] = `${out[region.bodyEndIndex]}\n  }\n  \\alternative {\n${altBlocks.join('\n')}\n  }`;
        for (const ending of region.endings) {
            for (let i = ending.startIndex; i <= ending.endIndex; i++) {
                consumed.add(i);
            }
        }
    }
    return out.filter((_, idx) => !consumed.has(idx));
};
