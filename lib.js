import { XmlWrapper } from "./xml_wrapper.js";
import { getStaffId, detectVersion, LATEST_FORMAT_VERSION } from "./compat.js";
import { analyzeVoicing } from "./render/voicing.js";
import { annotateTuplets } from "./render/tuplets.js";
import { findVoltaStart, mergeRepeatMarkers, analyzeRepeats, applyRepeats } from "./render/repeats.js";
import { annotateGraceNotes, graceCommandFor } from "./render/graceNotes.js";

/** 
 * @param {MetaTag} metaTag 
 * @returns {FlatMetaTag}
 */
export const parseMetaTag = (metaTag) => {
    if (!Array.isArray(metaTag)) {
        metaTag = [metaTag];
    }
    const ret = {};
    metaTag.forEach((tag) => {
        ret[tag.get('name')] = tag.text;
    });
    return ret;
}

const posKeySigs = ['C', 'G', 'D', 'A', 'E', 'B', 'Fis', 'Cis'];
const negKeySigs = ['C', 'F', 'Bes', 'Es', 'As', 'Des', 'Ges', 'Ces'];
/**
 * 
 * @param {XmlWrapper} keySig 
 * @returns {string} Lilypond note name for key signature in major
 */
export const parseKeySig = (keySig) => {
    const concertKey = parseInt(keySig.get('concertKey'), 10);
    if (Number.isNaN(concertKey)) {
        // seen on MuseScore 3.x files: an empty <KeySig/> with no concertKey at all
        console.warn('[mscx2ly] KeySig has no concertKey, defaulting to C major');
        return 'C';
    }
    if (concertKey > 0) {
        return posKeySigs[concertKey] || 'C';
    }
    return negKeySigs[-concertKey] || 'C';
}

/**
 * 
 * @param {XmlWrapper} keySig 
 * @returns {string} Lilypond code for key signature
 */
export const renderKeySig = (keySig) => {
    return `\\key ${parseKeySig(keySig).toLocaleLowerCase()} \\major`;
}

/**
 * 
 * @param {XmlWrapper} timeSig 
 */
const parseTimeSig = (timeSig) => {
    const n = timeSig.get('sigN');
    const d = timeSig.get('sigD');
    if (!n || !d) return "";
    return `\\time ${n}/${d}`;
}


// Length in quarter notes of a LilyPond duration such as "8" or "\\breve".
const quartersOfLily = (d) => (d === '\\breve' ? 8 : d === '\\longa' ? 16 : 4 / parseInt(d, 10));

// "5/8" has no single LilyPond duration, but 8*5 is one.
const lilyDurationOf = (ratio) => {
    if (durationMap[ratio]) return durationMap[ratio];
    const [n, d] = String(ratio).split('/').map(Number);
    return n && d ? `${d}*${n}` : undefined;
};

const durationMap = {
    "1": "1",
    "1/1": "1",
    "1/2": "2",
    "2/2": "1",
    "1/4": "4",
    "2/4": "2",
    "3/4": "2.",
    "4/4": "1",
    "1/8": "8",
    "2/8": "4",
    "3/8": "4.",
    "4/8": "2",
    "6/8": "2.",
    "8/8": "1",
    "1/16": "16",
    "2/16": "8",
    "3/16": "8.",
    "4/16": "4",
    "6/16": "4.",
    "8/16": "2",
    "12/16": "2.",
    "16/16": "1",
    "1/32": "32",
    "2/32": "16",
    "3/32": "16.",
    "4/32": "8",
    "6/32": "8.",
    "8/32": "4",
    "12/32": "4.",
    "16/32": "2",
    "24/32": "2.",
    "32/32": "1",
    "half": "2",
    "whole": "1",
    "quarter": "4",
    "eighth": "8",
    "16th": "16",
    "32nd": "32",
    "64th": "64",
    "128th": "128",
    "breve": "\\breve",
    "long": "\\longa",
    "1/64": "64",
    "1/128": "128",
}

// Words LilyPond refuses as variable names (checked against 2.24.3), e.g. a part called "Drums".
export const lilypondKeywords = new Set([
    'accepts', 'addlyrics', 'alias', 'alternative', 'book', 'bookpart', 'change', 'chordmode', 'chords',
    'consists', 'context', 'default', 'defaultchild', 'denies', 'description', 'drummode', 'drums', 'etc',
    'figuremode', 'figures', 'header', 'include', 'layout', 'lyricmode', 'lyrics', 'lyricsto', 'maininput',
    'markup', 'markuplist', 'midi', 'name', 'new', 'notemode', 'override', 'paper', 'remove', 'repeat',
    'rest', 'revert', 'score', 'sequential', 'set', 'simultaneous', 'tempo', 'type', 'unset', 'version', 'with',
    // commands and dynamics this converter writes itself: a variable of that name would redefine them
    'bar', 'box', 'clef', 'downbow', 'espressivo', 'fadein', 'fadeout', 'fermata', 'flageolet',
    'grace', 'acciaccatura', 'appoggiatura', 'henzelongfermata', 'henzeshortfermata', 'italic', 'key',
    'longfermata', 'major', 'mark', 'open', 'partial', 'sawtooth', 'shortfermata',
    'snappizzicato', 'swell', 'time', 'transpose', 'tuplet', 'upbow', 'verylongfermata', 'veryshortfermata',
    'markup', 'breve', 'longa', 'dynamic',
    'p', 'pp', 'ppp', 'pppp', 'f', 'ff', 'fff', 'ffff', 'mp', 'mf', 'fp', 'fz', 'rfz', 'sf', 'sff', 'sfp', 'sfz', 'sp', 'spp',
]);

// Note and rest names (Dutch note names, LilyPond's default) cannot be variable names either:
// "S", "A", "T", "B" are all valid part names in a choir score.
export const isReservedIdentifier = (id) => lilypondKeywords.has(id)
    || /^[a-g](?:is|es|s|ih|eh)*$/.test(id)
    || ['r', 's', 'q'].includes(id);

export const createValidPartName = (partName) => {
    // we need to make the partname a valid lilypond identifier
    // so we replace spaces with nothing, and make it lowercase
    // we also need to replace all numbers with its word equivalent
    let validPartName = partName.toLowerCase().replace(/[_-\s]/g, '');
    validPartName = validPartName.replace(/0/g, 'Zero');
    validPartName = validPartName.replace(/1/g, 'One');
    validPartName = validPartName.replace(/2/g, 'Two');
    validPartName = validPartName.replace(/3/g, 'Three');
    validPartName = validPartName.replace(/4/g, 'Four');
    validPartName = validPartName.replace(/5/g, 'Five');
    validPartName = validPartName.replace(/6/g, 'Six');
    validPartName = validPartName.replace(/7/g, 'Seven');
    validPartName = validPartName.replace(/8/g, 'Eight');
    validPartName = validPartName.replace(/9/g, 'Nine');
    // LilyPond only allows an underscore between letters, so runs of other characters
    // (e.g. "Vln.", "Clarinet (Bb)") collapse to one and never lead or trail the name
    validPartName = validPartName.replace(/[^\p{L}\p{M}]+/gu, '_').replace(/^_+|_+$/g, '');
    validPartName = validPartName || 'part';
    return isReservedIdentifier(validPartName) ? `${validPartName}Part` : validPartName;
}


export const getDurationFor = (evt) => {
    const duration = evt.get('duration') ? evt.get('duration') : evt.get('durationType');
    return durationMap[duration];
}

/**
 * 
 * @param {Rest} rest 
 * @param {TimeSig} timeSig
 * @returns {string} Lilypond code for rest
 */
export const parseRest = (rest, timeSig) => {
    // we need to know the duration of the rest in comparison to the time signature
    // rest has a durationType and a duration
    // if the durationType === "measure" then we have a whole rest, so we
    // can use `R`.
    // now we need to convert the ratio to a lilypond duration
    const restDuration = rest.get('duration') ? rest.get('duration') : rest.get('durationType');
    const isMeasureRest = rest.get('durationType') === "measure";
    // dots are only ever seen alongside durationType (e.g. "half" + dots="1"),
    // never alongside a duration fraction (which already bakes the dot into
    // durationMap, e.g. "3/8" -> "4."), so this can't double up a dot.
    const dots = rest.get('dots') ? parseInt(rest.get('dots'), 10) : 0;

    const duration = durationMap[restDuration];
    if (!duration) {
        // Full-measure rests in time signatures longer than a whole note
        // (e.g. 3/2, 6/4, 5/4, 8/4) aren't in durationMap; LilyPond expresses
        // these as a multiplied whole rest instead of a single duration string.
        if (isMeasureRest && restDuration && restDuration.includes('/')) {
            const [num, den] = restDuration.split('/').map(Number);
            if (num && den) {
                return `R1*${num}/${den}`;
            }
        }
        console.warn(`[mscx2ly] Unknown rest duration: "${restDuration}", substituting quarter rest`);
        return 'r4';
    }
    if (isMeasureRest) {
        return `R${duration}${'.'.repeat(dots)}`;
    }
    else {
        return `r${duration}${'.'.repeat(dots)}`;
    }
}

const metronomeNoteSymbolMap = {
    "metNoteQuarterUp": 4,
    "metNoteQuarterDown": 4,
    "metNoteHalfUp": 2,
    "metNoteHalfDown": 2,
    "metNoteWholeUp": 1,
    "metNoteWholeDown": 1,
    "metNoteEighthUp": 8,
    "metNoteEighthDown": 8,
    "metNote16thUp": 16,
    "metNote16thDown": 16,
}


const articulationMap = {
    "articStaccatoBelow": "-.",
    "articAccentBelow": "->",
    "articStaccatissimoBelow": "-!",
    "articTenutoBelow": "--",
    "articTenutoStaccatoBelow": "---.",
    "articMarcatoAbove": "---^",
    "articAccentStaccatoBelow": "->-.",
    "articMarcatoStaccatoAbove": "-^-.",
    "articMarcatoTenutoAbove": "-^--",
    "articStacatissimoStrokeBelow": "-!", // this one doesn't exist in Lilypond, vertical line under a note
    "articStacatissimoWedgeBelow": "-!", // this one doesn't exist in Lilypond, wedge under a note
    "articStressBelow": "->", // this one doesn't exist in Lilypond, accent sign under a note
    "articTenutoAccentBelow": "---^",
    // "articUnstressBelow": "<", // this one doesn't exist in Lilypond, it looks like a text tie
    "brassMuteOpen": "\\open",
    "brassMuteClosed": "-+",
    "stringsHarmonic": "\\flageolet",
    "stringsUpBow": "\\upbow",
    "stringsDownBow": "\\downbow",
    "articLaisserVibrer": "\\laissezVibrer",
    "articSoftAccentBelow": "\\espressivo", // espressivo
    "articSoftAccentStaccatoBelow": "-.\\espressivo", // espressivo staccato
    "articSoftAccentTenutoBelow": "--\\espressivo", // espressivo tenuto
    "articSoftAccentStaccatoTenutoBelow": "---.\\espressivo", // espressivo staccato tenuto
    // "guitarFadeIn": "\\fadein", // this one doesn't exist in Lilypond
    // "guitarFadeOut": "\\fadeout", // this one doesn't exist in Lilypond
    // "guitarVolumeSwell": "\\swell", // this one doesn't exist in Lilypond
    // "wiggleSawtooth": "\\sawtooth", // this one doesn't exist in Lilypond
    // "wiggleSawtoothWide": "\\sawtoothWide", // this one doesn't exist in Lilypond
    // "wiggleVibratoLargeFaster": "\\vibratoLargeFaster", // this one doesn't exist in Lilypond
    // "wiggleVibratoLargeSlowest": "\\vibratoLargeSlowest", // this one doesn't exist in Lilypond
    "pluckedSnapPizzicatoAbove": "\\snappizzicato"
}


export const renderArticulation = (articulation) => {
    const type = articulation.get('subtype');
    const ret = articulationMap[type];
    if (!ret) { 
        return ""; // nothing to do
    }
    return ret;
}


// midi pitch to note name
// midi pitch is a number between 0 and 127
// note name is a string with a note name and an octave indicated by ' or , or nothing
// midi pitch 60 is c' (middle c)
// midi pitch 61 can be cis or des, depending on the key signature
const octaveIndicator = {
    0: "'",
    1: "''",
    2: "'''",
    3: "''''",
    4: "'''''",
    "-1": '',
    "-2": ',',
    "-3": ',,',
    "-4": ',,,',
    "-5": ',,,,'
};


const noteNamesForKeySig = {
    "-1": ['c', 'cis', 'd', 'es', 'e', 'f', 'fis', 'g', 'as', 'a', 'bes', 'b'],
    plain:  ['c', 'cis', 'd', 'es', 'e', 'f', 'fis', 'g', 'gis', 'a', 'bes', 'b'],
    sharp: ['c', 'cis', 'd', 'dis', 'e', 'f', 'fis', 'g', 'gis', 'a', 'ais', 'b'],
    flat: ['c', 'des', 'd', 'es', 'e', 'f', 'ges', 'g', 'as', 'a', 'bes', 'b']    
} 

/**
 * This is a very primitive conversion from midi pitch to note name
 * It tries to take the key signature into account to get a bit of a 
 * hint what the best name would be. Far from perfect.
 * There is a technique to do this properly, but that requires actual musical analysis
 * of the material, which is beyond the scope of this project.
 * @param {number} midiPitch 
 * @param {KeySig} keySig 
 * @returns {string} note name
 */
const convertMidiPitchToNoteName = (midiPitch, keySig) => {
    // list of note names indexed
    const concertKey = keySig? keySig.get('concertKey'): 'plain';
    let keySigType = null;
    if (noteNamesForKeySig[concertKey]) {
        keySigType = concertKey;
    }
    else {
        keySigType = concertKey === 0 ? 'plain' : concertKey > 0 ? 'sharp' : 'flat';
    }
    const noteNames = noteNamesForKeySig[keySigType];
    const baseNoteIdx = midiPitch % 12;
    const baseOctave = Math.floor(midiPitch / 12) - 5;
    return noteNames[baseNoteIdx] + octaveIndicator[baseOctave];
}
/**
 * 
 * @param {Note} note
 * @param {KeySig} keySig 
 * @returns {string} Lilypond note name with possible accidental
 */
const parseNote = (note, keySig) => {
    // we need to convert the midi pitch (at pitch) to a note name
    // this is not straightforward, because it depends on the key signature (a bit)
    // we do have a possible accidental
    const base = convertMidiPitchToNoteName(note.get('pitch'), keySig);
    if (note.get('Accidental')) {
        return base + "!";
    }
    return base;
};

/**
 * 
 * @param {Chord} chord
 * @param {TimeSig} timeSig 
 */
export const parseChord = (chord, timeSig, keySig, lyric, lyricDuration) => {
    const dur = durationMap[chord.get('durationType')];
    if (!dur) {
        console.warn(`[mscx2ly] Unknown chord duration type: "${chord.get('durationType')}", skipping chord`);
        return '';
    }
    const dots = chord.get('dots')? parseInt(chord.get('dots'), 10) : 0;
    const duration = dur + '.'.repeat(dots);

    let noteInfo = chord.get('Note');
    if (!Array.isArray(noteInfo)) {
        noteInfo = [noteInfo];
    }
    let hasTie = false;
    const notes = noteInfo.map((note) => {
        let spanner = note.get('Spanner');
        if (spanner) {
            if (!Array.isArray(spanner)) spanner = [spanner];
            hasTie = spanner.some((span) => {
                return span.get('type') === 'Tie' && span.get('next');
            });    
        }
        return parseNote(note, keySig);
    });
    let ret;
    if (notes.length > 1) {
        ret = `<${notes.join(' ')}>${duration}`;
    }
    else ret = notes[0] + duration;

    // this assumes that the value in subtype is of the format `r[sub_length]`
    // so r8 for a subdivision in 8ths
    const tremolo = chord.get('TremoloSingleChord');
    if (tremolo) {
        ret += `:${tremolo.get('subtype').substr(1)}`; // cut off the r at the beginning
    }
    let articulation = chord.get('Articulation');
    if (articulation) {
        if (!Array.isArray(articulation)) {
            articulation = [articulation];
        }
        ret += articulation.map(renderArticulation).join(' ');
    }
    let spanner = chord.get('Spanner');
    if (spanner) {
        if (!Array.isArray(spanner)) {
            spanner = [spanner];
        }
        spanner.forEach((span) => {
            if (span.get('type') === 'Slur') {
                if (span.get('next')) {
                    ret += '(';
                }
                if (span.get('prev')) {
                    ret += ')';
                }
            }
        });
    }
    // lyric.isDone: undefined on the chord that carries the lyric, false while a tie chain from it
    // runs (those chords lengthen the lyric), true once the chain has ended
    if (lyric && lyric.isDone !== true) {
        if (lyric.isDone === false) lyric.end += lyricDuration ?? quartersOfLily(dur);
        lyric.isDone = !hasTie;
    }
    if (hasTie) ret += ' ~';
    return ret;
}

/**
 * 
 * @param {string} clef Clef as string from the MuseScore XML file
 * @returns {string} Lilypond code for clef
 */
export function renderClef(clef) {
    if (Array.isArray(clef)) {
        clef = clef[0];
    }
    switch (clef) {
        case 'G': return '\\clef treble';
        case 'F': return '\\clef bass';
        case 'C': return '\\clef alto';
        case 'G8vb': return '\\clef "treble_8"';
        case 'F8vb': return '\\clef "bass_8"';
        case 'G8va': return '\\clef "treble^8"';
        case 'G15ma': return '\\clef "treble^15"';
        case 'PERC': return '\\clef percussion';
        default: return '\\clef treble';
    }
}


export function renderBarLine(barLine) {
    const type = barLine.get('subtype');
    let str = '';
    switch (type) {
        case 'final': str = '|.'; break;
        case 'end': str = '|.'; break;
        case 'double': str = '||'; break;
        case 'dashed': str = '!'; break;
        case 'dotted': str = ';' ; break;
        case 'reverse-end': str = '.|'; break;
        case 'heavy': str = 'x-.'; break;
        case 'double-heavy': str = '..'; break;
        case null: {
            // these are gregorian barlines
            const fromOffset = parseInt(barLine.get('spanFromOffset'), 10);
            const toOffset = parseInt(barLine.get('spanToOffset'), 10);
            if (fromOffset === -1 && toOffset === -7) {
                str = "'";
            }
            else if (fromOffset === -2 && toOffset === -6) {
                // this is a longer version of the one above, Lilypond doesn't seem to have this by default
                // as a \bar type
                str = "'"; // return the same as the small
            }
            else if (fromOffset === -2 && toOffset === -2) {
                str = ","; 
            }
            else if (fromOffset === -1 && toOffset === -1) {
                // this is a longer version of the one above, Lilypond doesn't seem to have this by default
                str = ","; // return the same as the small
            }
            else if (fromOffset === 2 && toOffset === -2) {
                // divisio minima (chant comma), positive-offset variant of the -2/-2 case above
                str = ",";
            }
            else if (fromOffset === 1 && toOffset === -1) {
                // divisio maior — a bigger pause than divisio minima. LilyPond has no
                // dedicated \bar glyph for this (real Gregorian notation uses
                // \caesura \shortfermata, a note-attached event, not a barline token);
                // \bar ";" is a dotted barline, which doesn't match either, so reuse
                // ',' as the closest available approximation.
                str = ",";
            }
            break;
        }
    }       
    if (str) {
        return `\\bar "${str}"`;
    }
    else return ""; // no barline if we don't know what it is
}

/**
 * 
 * @param {Part} part 
 * @param {FlatScoreStaff} staffInfo 
 * @returns 
 */

export const readPartInfo = (part, staffInfo, staffOffset = 0) => {
    // this returns an object with the information of the part
    // Handle null part case
    if (!part) return null;
    let instruments = part.get('Instrument');
    if (!Array.isArray(instruments)) {
        instruments = [instruments];
    }
    const ret = {};
    ret.id = part.get('id');
    ret.trackName = plainTextOf(part.get('trackName', true)) ?? '';
    ret.instrument = instruments.map((instrument) => {
        // Handle null instrument case
        if (!instrument) return null;
        let instrChannel = instrument.get('Channel');
        if (!Array.isArray(instrChannel)) {
            instrChannel = [instrChannel];
        }
        return {
            id: instrument.get('id'),
            longName: plainTextOf(instrument.get('longName', true)) ?? '',
            shortName: plainTextOf(instrument.get('shortName', true)) ?? '',
            trackName: instrument.get('trackName'),
            minPitchP: instrument.get('minPitchP'),
            maxPitchP: instrument.get('maxPitchP'),
            minPitchA: instrument.get('minPitchA'),
            maxPitchA: instrument.get('maxPitchA'),
            transposeDiatonic: instrument.get('transposeDiatonic'),
            transposeChromatic: instrument.get('transposeChromatic'),
            instrumentId: instrument.get('instrumentId'),
            clef: instrument.get('clef'),
            Channel: instrChannel.map((channel) => {
                return {
                    synti: channel.get('synti'),
                    midiPort: channel.get('midiPort'),
                    midiChannel: channel.get('midiChannel'),
                    program: channel.get('program')
                }
            })
        }
    });
    let staffs = part.get('Staff');
    if (!Array.isArray(staffs)) {
        staffs = [staffs];
    }
    ret.staffs = staffs.map((staff, idx) => {
        const staffId = getStaffId(staff);
        // Match by document position, not by id/eid equality: <Score><Staff id="N">
        // numbers staves by position in every MuseScore format era (see compat.js), it
        // is never a key to cross-reference against <Part><Staff>'s own id/eid.
        const staffContents = staffInfo[staffOffset + idx];
        if (!staffContents) {
            console.warn(`[mscx2ly] No score staff found at position ${staffOffset + idx} (staff id "${staffId}"); returning staff with empty contents`);
        }
        let defaultConcertClef = staff.get('defaultConcertClef')? staff.get('defaultConcertClef') : null;
        let defaultClef = staff.get('defaultClef')? staff.get('defaultClef') : defaultConcertClef;
        const staffType = staff.get('StaffType');
        // Only present when it differs from LilyPond's/MuseScore's own default
        // of 5 (e.g. single-line percussion staves); see renderStaffLineCount.
        const lineCount = staffType && staffType.get('lines') ? parseInt(staffType.get('lines'), 10) : null;
        // <bracket type=".." span=".." col=".."/> is MuseScore's own already-
        // computed grouping (col="0" = outermost, e.g. the whole woodwind
        // section; deeper col values are nested sub-brackets, e.g. 2 clarinets
        // within that section) — used directly instead of re-deriving section
        // membership from instrument-family heuristics (see readPartsInfo).
        let brackets = staff.get('bracket');
        if (brackets && !Array.isArray(brackets)) {
            brackets = [brackets];
        }
        return {
            id: staffId,
            StaffType: staffType,
            lineCount,
            brackets: (brackets || []).map((bracket) => ({
                type: bracket.get('type'),
                span: parseInt(bracket.get('span'), 10),
                col: bracket.get('col'),
            })),
            isStaffVisible: staff.get('isStaffVisible'),
            barLineSpan: staff.get('barLineSpan'),
            defaultClef,
            contents: staffContents ? staffContents.Measure : [],
        }
    });
    return ret;
}

/**
 * 
 * @param {Part[]} parts 
 * @param {OrderInfo} orderInfo 
 * @param {FlatScoreStaff} staffInfo 
 * @returns {}
 */
export const readPartsInfo = (parts = [], orderInfo, staffInfo) => {
    // this returns an object with the part name as key
    // and any staffs used in the part, plus other information
    if (!Array.isArray(parts)) {
        parts = parts ? [parts] : [];
    }
    let staffOffset = 0;
    const partsInfo = parts.map((part) => {
        const info = readPartInfo(part, staffInfo, staffOffset);
        staffOffset += info ? info.staffs.length : 0;
        return info;
    });
    // Group parts using MuseScore's own already-computed bracket spans
    // (<bracket col="0"> on a part's first staff = an outermost bracket,
    // e.g. the whole woodwind section) rather than re-deriving section
    // membership from instrument-family heuristics: a part's own
    // instrumentId (e.g. "wind.reed.clarinet.bflat") uses a different
    // taxonomy than <Order>'s instrument ids (e.g. "bb-clarinet"), and
    // doesn't reliably substring-match either the section id or family name.
    // type="1" (brace) is excluded: that's a single multi-staff instrument's
    // own grand-staff brace (e.g. piano), already handled by the
    // `staffs.length > 1` PianoStaff branch in renderPart, not a
    // cross-part section grouping.
    let ret = [];
    let i = 0;
    while (i < partsInfo.length) {
        const partInfo = partsInfo[i];
        const firstStaff = partInfo && partInfo.staffs[0];
        const outerBracket = firstStaff && firstStaff.brackets.find((bracket) => {
            return parseInt(bracket.col, 10) === 0 && bracket.span > 1 && parseInt(bracket.type, 10) !== 1;
        });
        if (!outerBracket) {
            ret.push(partInfo);
            i += 1;
            continue;
        }
        // the bracket's span counts *staves*, not parts — a part can itself
        // have more than one staff (e.g. a piano within the section)
        let stavesRemaining = outerBracket.span;
        const sectionParts = [];
        while (stavesRemaining > 0 && i < partsInfo.length) {
            sectionParts.push(partsInfo[i]);
            stavesRemaining -= partsInfo[i].staffs.length;
            i += 1;
        }
        ret.push({ isSection: true, id: outerBracket.type, parts: sectionParts });
    }
    return ret;
}


/**
 * 
 * @param {Order} order 
 * @returns {OrderInfo}
 */
export const readOrderInfo = (order) => {
    if (!order) {
        return {
            instruments: [],
            sections: []
        }
    }
    // first: instruments
    let instruments = order.get('instrument');
    if (!Array.isArray(instruments)) {
        instruments = [instruments];
    }
    instruments = instruments.map((instrument) => {
        let fam = instrument.get('family', true);
        if (!Array.isArray(fam)) {
            fam = [fam];
        }
        return {
            id: instrument.get('id'),
            family: fam.map((family) => {
                return {
                    id: family.get('id'),
                    name: family.text
                }
            })
        }
    });
    // second: sections
    let sections = order.get('section');
    if (!Array.isArray(sections)) {
        sections = [sections];
    };
    sections = sections.map((section) => {
        let unsorted = section.get('unsorted');
        if (unsorted && !Array.isArray(unsorted)) {
            unsorted = [unsorted];
        }
        else {
            unsorted = [];
        }
        let family = section.get('family');
        if (!Array.isArray(family)) {
            family = [family];
        }
        return {
            id: section.get('id'),
            brackets: section.get('brackets') === 'true',
            barLineSpan: section.get('barLineSpan') === 'true',
            thinBrackets: section.get('thinBrackets') === 'true',
            family,
            unsorted: unsorted.map((unsorted_obj) => {
                return {
                    group: unsorted_obj.get('group')
                }
            })
        }
    });
    // now we return an order of instruments and sections
    // so we can attach parts to the sections
    return {
        instruments,
        sections
    }
}


/**
 * 
 * @param {XmlWrapper[]} staffs 
 * @returns {FlatScoreStaff} reduced staff info
 */
export const readStaffInfo = (staffs = []) => {
    if (!Array.isArray(staffs)) {
        staffs = staffs ? [staffs] : [];
    }
    return staffs.map((staff) => {
        // Skip null staff entries (shouldn't happen but just in case)
        if (!staff) return null;
        const staffId = getStaffId(staff);
        // Handle case where staff might not have any Measure elements
        let staffMeasures = staff.get('Measure') || [];
        if (!Array.isArray(staffMeasures)) {
            staffMeasures = [staffMeasures];
        }
        const ret = {
            id: staffId,
            Measure: staffMeasures.map((measure) => {
                let voices = measure.get('voice');
                if (!voices) {
                    voices = [];
                } else if (!Array.isArray(voices)) {
                    voices = [voices];
                }
                voices = voices.filter(Boolean);
                const filteredVoices = voices.map((voice) => {
                    // the purpose here is a filter to only get the relevant information
                    // now order becomes important, so we use the children instead.
                    return (voice.children || []).filter((child) => {
                        return [
                            'KeySig', 
                            'TimeSig', 
                            'Tempo', 
                            'Rest', 
                            'Dynamic', 
                            'Spanner', 
                            'Chord', 
                            'BarLine', 
                            'VBox', 
                            'Clef',
                            'Fermata',
                            'PlayTechAnnotation',
                            'RehearsalMark',
                            'Tuplet',
                            'endTuplet'
                        ].includes(child.name);
                    });
                });
                return {
                    // startRepeat/endRepeat/Volta live on <Measure>, not in the
                    // voice event stream (see tickets/B01-repeat-barlines-not-converted.md),
                    // and MuseScore only stores them on one staff per system —
                    // findVoltaStart/analyzeRepeats merge these across staves.
                    startRepeat: !!measure.get('startRepeat'),
                    endRepeat: measure.get('endRepeat'),
                    voltaStart: findVoltaStart(filteredVoices),
                    irregular: measure.get('irregular'),
                    len: measure.get('len'),
                    voice: filteredVoices
                }
            })
        }
        return ret;
    });
};

const fermatas = {
    fermataAbove: "\\fermata",
    fermataBelow: "_\\fermata",
    fermataShortAbove: "\\shortfermata",
    fermataShortBelow: "_\\shortfermata",
    fermataLongAbove: "\\longfermata",
    fermataLongBelow: "_\\longfermata",
    fermataLongHenzeAbove: "\\henzelongfermata",
    fermataLongHenzeBelow: "_\\henzelongfermata",
    fermataShortHenzeAbove: "\\henzeshortfermata",
    fermataShortHenzeBelow: "_\\henzeshortfermata",
    fermataVeryLongAbove: "\\verylongfermata",
    fermataVeryLongBelow: "_\\verylongfermata",
    fermataVeryShortAbove: "\\veryshortfermata",
    fermataVeryShortBelow: "_\\veryshortfermata",
}

export const renderFermata = (fermata) => {
    const type = fermata.get('subtype');
    return fermatas[type] || "";
}

const escapeLilyString = (text) => String(text ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// <text> comes back as a node (formatted or not) with forceChild, as a plain string otherwise.
const plainTextOf = (text) => (typeof text === 'string' ? text : text?.plainText);

export const renderRehearsalMark = (mark) => {
    const label = plainTextOf(mark.get('text', true));
    return label ? `\\mark \\markup { \\box "${escapeLilyString(label)}" }` : '';
}

export const renderHairPin = (spanner) => {
    const isEnd = !!spanner.get('prev');
    if (isEnd) { 
        return "\\!";
    }
    const hairpin = spanner.get('HairPin'); // this will be null when isEnd
    const isStart = !!spanner.get('next');
    const subType = hairpin.get('subtype'); // 0 for cresc, 1 for decresc
    const type = (subType === '0' || subType === '2') ? '\\<' : '\\>'; // 0 cresc. hairpin, 2 cresc. line
    return type;
}


export const renderSpanner = (spanner) => {
    const type = spanner.get('type'); // xml attribute
    const typeObject = spanner.get(type); // xml object named after the xml attribute type
    const isStart = !!spanner.get('next');
    const isEnd = !!spanner.get('prev');
    if (!typeObject && !isEnd) {
        // this means that the spanner does not exist as a subchild
        console.warn('[mscx2ly] Spanner type not found:', type);
        return "";
    }
    if (type === 'HairPin') {
        return renderHairPin(spanner);
    }
    else if (type === 'Volta') {
        // handled structurally as \repeat volta/\alternative, see render/repeats.js
        return "";
    }
    else {
        console.warn('[mscx2ly] Spanner type not implemented:', type);
    }
    return ""; 
}

// this is a way to keep track of spanners and other things that needs to be retrieved in t
class OnceConsumer {
    constructor (type = 'fifo') {
        this.data = {};
        this.type = type; // fifo or lifo
    }

    set (key, value) {
        if (!this.data[key]) {
            this.data[key] = [value];
        }
        else {
            this.data[key].push(value);
        }
    }

    has (key) {
        return this.data[key] && this.data[key].length > 0;
    }

    getAll (key) {
        const all = this.data[key] || [];
        this.data[key] = [];
        return all;
    }

    get (key) {
        if (this.data[key] && this.data[key].length > 0) {
            if (this.type === 'lifo') {
                return this.data[key].pop();
            }
            else {
                return this.data[key].shift();
            }
        }
    }
}

export const renderDynamic = (dynamic) => {
    const type = dynamic.get('subtype');
    let ret = '';
    switch (type) {
        case 'ppp': ret = '\\ppp'; break;
        case 'pp': ret = '\\pp'; break;
        case 'p': ret = '\\p'; break;
        case 'mp': ret = '\\mp'; break;
        case 'mf': ret = '\\mf'; break;
        case 'f': ret = '\\f'; break;
        case 'ff': ret = '\\ff'; break;
        case 'fff': ret = '\\fff'; break;
        case 'fp': ret = '\\fp'; break;
        case 'pf': ret = '_\\markup { \\dynamic pf }'; break;
        case 'sf': ret = '\\sf'; break;
        case 'sfz': ret = '\\sfz'; break;
        case 'sff': ret = '\\sff'; break;
        case 'sffz': ret = '_\\markup { \\dynamic sffz }'; break;
        case 'sfp': ret = '\\sfp'; break;
        case 'rfz': ret = '\\rfz'; break;
        case 'rf': ret = '_\\markup { \\dynamic rf }'; break;
        case 'fz': ret = '\\fz'; break;        
    }
    return ret;
}

const containsSym = (node) => node['#name'] === 'sym' || (node.$$ || []).some(containsSym);
const collectSyms = (node) => node['#name'] === 'sym'
    ? [typeof node._ === 'string' ? node._ : '']
    : (node.$$ || []).flatMap(collectSyms);

export const parseTempo = (tempoEvt) => {
    // this requires a bit of trickery
    /*
          <Tempo>
            <tempo>1</tempo>
            <followText>1</followText>
            <eid>nZKNqFjlayM_cWyfGetlnSK</eid>
            <text><sym>metNoteQuarterUp</sym><font face="Edwin"></font> = 60</text>
            </Tempo>

        
                  <Tempo>
            <tempo>1</tempo>
            <followText>1</followText>
            <eid>+13ij4Pf60O_vTAaptrxsfI</eid>
            <minDistance>-999</minDistance>
            <family>FreeSerif</family>
            <bold>0</bold>
            <offset x="-1.35348" y="-4.29607"/>
            <text><b></b><sym>metNoteQuarterUp</sym><b><font face="FreeSerif"/> = 60


</b></text>
            </Tempo>
    */
    const tempo = tempoEvt.get('tempo'); 
    const followText = tempoEvt.get('followText');
    const type = tempoEvt.get('type'); // this can be aTempo, or nothing
    // forceChild=true so a mixed-content <text> (metronome symbol + trailing
    // "= 80") isn't collapsed to just its trailing text by XmlWrapper's
    // isText shortcut, which fires whenever *any* direct text is present,
    // even alongside child elements like <sym>.
    const textNode = tempoEvt.get('text', true);
    let tempoValue, tempoText;
    if (textNode && textNode.hasChildren) {
        // Deep search through the XML data structure to find tempo value
        const searchForTempoValue = (obj) => {
            if (typeof obj === 'string') {
                const match = obj.match(/=[\s\S]?([0-9]+)/);
                if (match) {
                    return match[1];
                }
            }
            if (obj && typeof obj === 'object') {
                for (const key in obj) {
                    const result = searchForTempoValue(obj[key]);
                    if (result) return result;
                }
            }
            return null;
        };
        tempoValue = searchForTempoValue(textNode.data);
        if (tempoValue) {
            tempoValue = parseInt(tempoValue, 10);
        }
        if (!containsSym(textNode.data)) {
            // formatted free text such as <text><b>Allegro</b></text>: keep the words, drop the formatting
            tempoText = textNode.plainText.replace(/\s+/g, ' ').trim() || undefined;
        }
    }
    else if (textNode) {
        tempoText = textNode.text;
    }

    const syms = (!type && textNode && textNode.hasChildren) ? collectSyms(textNode.data) : [];
    const tempoSymbol = syms.length === 1 ? syms[0] : (syms.length ? syms : "");
    const tempoSymbolValue = type? "": metronomeNoteSymbolMap[tempoSymbol];
    if (!tempoSymbolValue && !type && !tempoText) {
        console.warn('Unknown tempo symbol:', tempoSymbol);
    }
    return {
        tempo,
        followText,
        tempoText,
        tempoValue,
        tempoSymbol,
        tempoSymbolValue
    };
}

export const renderTempo = (tempoInfo) => {
    // free text (e.g. "A Tempo", from a <Tempo type="aTempo">) with no metronome mark
    if (tempoInfo.tempoText) {
        return `\\tempo "${escapeLilyString(tempoInfo.tempoText)}"`;
    }
    if (tempoInfo.tempoSymbolValue && tempoInfo.tempoValue) {
        return `\\tempo ${tempoInfo.tempoSymbolValue} = ${tempoInfo.tempoValue}`;
    }
    return '';
}


// Voice-event handlers. Each takes (evt, ctx), may mutate ctx, and returns the
// LilyPond text for that event (or undefined, matching a switch case that
// falls through without an explicit `return`).

function handleTempo(evt, ctx) {
    const tempo = parseTempo(evt);
    // a text-only marking ("a tempo", "Lento") leaves the running metronome tempo in force
    if (tempo.tempoValue && tempo.tempoSymbolValue) {
        ctx.currentTempo = tempo;
        ctx.tempoMap.push({ at: ctx.currentTime, msPerQuarter: 60000 * tempo.tempoSymbolValue / (4 * tempo.tempoValue) });
    }
    return renderTempo(tempo);
}

// Milliseconds at a position in quarter notes; the first tempo also covers anything before it.
const quartersToMs = (quarters, tempoMap) => {
    let ms = 0;
    let at = 0;
    let rate = tempoMap[0].msPerQuarter;
    for (const change of tempoMap) {
        if (change.at >= quarters) break;
        ms += (change.at - at) * rate;
        at = change.at;
        rate = change.msPerQuarter;
    }
    return Math.round((ms + (quarters - at) * rate) * 1000) / 1000;
};

function handleKeySig(evt, ctx) {
    if (ctx.isPercussion) return;
    ctx.currentKeySig = evt;
    return renderKeySig(evt);
}

function handleTimeSig(evt, ctx) {
    ctx.currentTimeSig = evt;
    return parseTimeSig(evt);
}

function applyPendingModifiers(rendered, voiceConsumer) {
    if (voiceConsumer.has('dynamic')) rendered = `${rendered}${voiceConsumer.get('dynamic')}`;
    if (voiceConsumer.has('spanner')) rendered = `${rendered}${voiceConsumer.getAll('spanner').join('')}`;
    if (voiceConsumer.has('text')) rendered = `${rendered}${voiceConsumer.get('text')}`;
    if (voiceConsumer.has('fermata')) rendered = `${rendered}${voiceConsumer.get('fermata')}`;
    return rendered;
}

function handleRest(evt, ctx) {
    // we want to do time tracking, so we need to know the duration of the rest
    // Parse the raw MuseScore ratio (e.g. "3/8") directly to avoid
    // parseInt dropping dots from dotted LilyPond duration strings.
    const restRaw = evt.get('duration') || evt.get('durationType');
    const restParts = restRaw && restRaw.includes('/') ? restRaw.split('/').map(Number) : null;
    const tupletScale = ctx.currentTupletRatio ? ctx.currentTupletRatio.normal / ctx.currentTupletRatio.actual : 1;
    if (restParts) {
        ctx.currentTime += 4 * restParts[0] / restParts[1] * tupletScale;
    } else {
        const restDur = getDurationFor(evt);
        if (restDur) {
            // durationType-based rests (no duration fraction) carry dots
            // separately, e.g. durationType="half" dots="1" for a dotted half.
            const dots = evt.get('dots') ? parseInt(evt.get('dots'), 10) : 0;
            const dotMultiplier = 2 - Math.pow(2, -dots);
            ctx.currentTime += quartersOfLily(restDur) * dotMultiplier * tupletScale;
        }
    }
    const renderedRest = parseRest(evt, ctx.currentTimeSig);
    return applyPendingModifiers(renderedRest, ctx.voiceConsumer);
}

function handleChord(evt, ctx) {
    // Parse raw MuseScore ratio directly to avoid parseInt dropping dots.
    const chordRaw = evt.get('duration') || evt.get('durationType');
    const chordParts = chordRaw && chordRaw.includes('/') ? chordRaw.split('/').map(Number) : null;
    let duration = chordParts ? 4 * chordParts[0] / chordParts[1]
        : (() => {
            const d = getDurationFor(evt);
            const dots = evt.get('dots') ? parseInt(evt.get('dots'), 10) : 0;
            return d ? quartersOfLily(d) * (2 - Math.pow(2, -dots)) : 0;
        })();
    if (ctx.currentTupletRatio) {
        duration *= ctx.currentTupletRatio.normal / ctx.currentTupletRatio.actual;
    }
    if (evt.get('Lyrics')) {
        // we have to be aware that the current note might be tied to the next note
        // and so the duration of the lyric is not the same as the current duration of this
        // note event.
        let lyricEntries = evt.get('Lyrics');
        if (!Array.isArray(lyricEntries)) lyricEntries = [lyricEntries];
        if (lyricEntries.length > 1) {
            // multiple verses on one note; only the first verse is supported for now
            console.warn('[mscx2ly] Multiple lyric verses on one note are not supported yet; using the first verse');
        }
        const lyricData = lyricEntries[0];
        const lyric = {
            voiceIdx: ctx.voiceIdx,
            start: ctx.currentTime,
            end: ctx.currentTime + duration,
            text: plainTextOf(lyricData.get('text', true)) ?? '',
            syllabic: lyricData.get('syllabic'),
            currentTempo: ctx.currentTempo,
        };
        // the staff's tempo changes, complete once the staff is rendered; not part of the printed timing data
        Object.defineProperty(lyric, 'tempoMap', { value: ctx.tempoMap });
        // an extender line (<ticks>1/1</ticks>, a whole note) keeps the syllable going past its own notes
        const [tickN, tickD] = String(lyricData.get('ticks') ?? '').split('/').map(Number);
        Object.defineProperty(lyric, 'melismaEnd', { value: tickN && tickD ? ctx.currentTime + 4 * tickN / tickD : 0 });
        ctx.lyrics.push(lyric);
        ctx.lastLyrics[ctx.voiceIdx] = lyric;
    }
    // Grace notes borrow their time from the note they precede; MuseScore
    // doesn't count them towards the measure's own length, so neither should we.
    if (!ctx.isGraceNote) {
        ctx.currentTime += duration;
    }
    const renderedChord = parseChord(evt, ctx.currentTimeSig, ctx.currentKeySig, ctx.isGraceNote ? null : ctx.lastLyrics[ctx.voiceIdx], duration);
    // a skipped chord or a grace chord leaves dynamics, hairpins and fermatas for the note they belong to
    if (!renderedChord || ctx.isGraceNote) return renderedChord;
    return applyPendingModifiers(renderedChord, ctx.voiceConsumer);
}

function handleClef(evt) {
    const clef = evt.get('concertClefType') || evt.get('transposingClefType');
    return renderClef(clef);
}

function handleBarLine(evt) {
    return renderBarLine(evt);
}

function handleFermata(evt, ctx) {
    ctx.voiceConsumer.set('fermata', renderFermata(evt));
}

// Rendered as its own token (like Clef/TimeSig), not a postfix modifier on
// voiceConsumer: \mark isn't attachable to a note the way ^\markup is, it
// must appear as its own music-event ahead of the note it aligns with.
function handleRehearsalMark(evt) {
    return renderRehearsalMark(evt);
}

function handlePlayTechAnnotation(evt, ctx) {
    const text = `^\\markup { \\italic "${escapeLilyString(plainTextOf(evt.get('text', true)))}" }`;
    ctx.voiceConsumer.set('text', text);
}

function handleSpanner(evt, ctx) {
    const spanner = renderSpanner(evt);
    if (spanner) ctx.voiceConsumer.set('spanner', spanner);
}

function handleDynamic(evt, ctx) {
    const dynamic = renderDynamic(evt);
    if (dynamic) ctx.voiceConsumer.set('dynamic', dynamic);
}

const baseEventHandlers = {
    Tempo: handleTempo,
    KeySig: handleKeySig,
    TimeSig: handleTimeSig,
    Rest: handleRest,
    Chord: handleChord,
    Clef: handleClef,
    BarLine: handleBarLine,
    Fermata: handleFermata,
    PlayTechAnnotation: handlePlayTechAnnotation,
    RehearsalMark: handleRehearsalMark,
    Spanner: handleSpanner,
    Dynamic: handleDynamic,
};

/**
 * Voice-event handler tables, gated by MuseScore format version, modeled on
 * MuseScore's own RWRegister::reader(version) factory (see
 * musescore/src/engraving/rw/rwregister.cpp): an ordered, low-to-high list of
 * version-range entries, each one only a `{ ...previous, EventName: override }`
 * layer on the one before — the same way upstream's newer readers reuse an
 * older era's code and override just what changed for that era, instead of
 * branching version checks inline through shared code.
 *
 * No event actually renders differently by version yet — every cross-version
 * quirk found so far turned out to belong elsewhere (structural staff
 * matching in readPartInfo, or a universal defensive fallback that must apply
 * to every version, e.g. handleKeySig). This is the seam for when one does.
 */
const eventHandlerRegistry = [
    { maxVersion: Infinity, handlers: baseEventHandlers },
];

export function getEventHandlers(formatVersion) {
    const entry = eventHandlerRegistry.find((e) => formatVersion <= e.maxVersion);
    return entry ? entry.handlers : baseEventHandlers;
}

export const renderMusicForStaff = (staff, formatVersion = LATEST_FORMAT_VERSION, showBarNumbers = false, repeatRegions = []) => {
    const staffContents = staff.contents;
    const eventHandlers = getEventHandlers(formatVersion);
    const ctx = {
        isPercussion: staff.defaultClef === 'PERC',
        currentKeySig: null,
        currentTimeSig: null,
        currentTempo: undefined,
        currentTime: 0,
        lastLyrics: {},
        tempoMap: [],
        lyrics: [],
        voiceConsumer: null,
        voiceIdx: 0,
        currentTupletRatio: null,
        isGraceNote: false,
    };
    let barNumber = 0;
    const ret = staffContents.map((measure) => {
        barNumber += 1;
        let measureText = '';
        // TODO: we need to do something about the transposition
        if (measure.len) {
            // we assume a \partial for now
            measureText += `\\partial ${lilyDurationOf(measure.len)}`;
        }
        const voices = measure.voice;
        const voiceRenderedMusic = [];
        const measureStart = ctx.currentTime;
        let measureEnd = measureStart;
        const parsedVoices = voices.map((voice, voiceIdx) => {
            // we need to keep the fermata, as in Lilypond it should always follow the event it is attached to
            ctx.voiceConsumer = new OnceConsumer('lifo');
            ctx.voiceIdx = voiceIdx;
            ctx.currentTime = measureStart;

            const annotated = annotateGraceNotes(annotateTuplets(voice));
            const voiceText = annotated.map(({ evt, tupletRatio, tupletOpens, tupletCloses, graceType, graceGroupStart, graceGroupEnd }) => {
                ctx.currentTupletRatio = tupletRatio;
                ctx.isGraceNote = !!graceType;
                const handler = eventHandlers[evt.name];
                let rendered = (handler ? handler(evt, ctx) : '') ?? '';
                if ((evt.name === 'Chord' || evt.name === 'Rest') && !graceType && String(rendered).trim()) {
                    voiceRenderedMusic[voiceIdx] = true;
                }
                if (tupletOpens.length) {
                    const opens = tupletOpens.map(r => `\\tuplet ${r.actual}/${r.normal} {`).join(' ');
                    rendered = `${opens} ${rendered}`;
                }
                if (tupletCloses) {
                    rendered = `${rendered} ${Array(tupletCloses).fill('}').join(' ')}`;
                }
                if (graceGroupStart) {
                    rendered = `${graceCommandFor(graceType)} { ${rendered}`;
                }
                if (graceGroupEnd) {
                    rendered = `${rendered} }`;
                }
                return rendered;
            }).join(' ');
            measureEnd = Math.max(measureEnd, ctx.currentTime);
            return voiceText;
        });
        ctx.currentTime = measureEnd;
        // A voice with no supported children renders to an empty string.
        // Filter those out so they don't produce stray spaces/empty blocks.
        const nonEmptyVoices = parsedVoices.filter(v => v && v.trim());
        // Data-driven decision (render/voicing.js): whether this measure has
        // no real musical content (no Chord/Rest in any voice), one musical
        // voice, or genuine polyphony — decided from the parsed data, not by
        // inspecting the rendered strings.
        const voicingDecision = analyzeVoicing(voices);
        // A chord can be musical yet render to nothing (e.g. an unsupported duration); such a
        // measure still needs the spacer so bar checks and timing stay aligned.
        const musicalIdxs = voicingDecision.type === 'single' ? [voicingDecision.voiceIdx]
            : voicingDecision.type === 'parallel' ? voicingDecision.voiceIdxs : [];
        const rendersMusic = musicalIdxs.some((idx) => voiceRenderedMusic[idx]);
        let body;
        if (voicingDecision.type === 'empty' || !rendersMusic) {
            // Emit a spacer rest so bar checks remain valid in LilyPond and
            // currentTime stays aligned for subsequent lyric timing. Any
            // structural-only text (e.g. a lone KeySig with no notes) is
            // still printed alongside the spacer, never dropped.
            let spacer;
            if (measure.len) {
                // Pickup (partial) measure: spacer must match the partial duration.
                // Derive currentTime from the raw ratio (e.g. "3/8") to correctly
                // handle dotted durations — parseInt on the LilyPond string "4." drops the dot.
                const partialDur = lilyDurationOf(measure.len);
                const [num, den] = measure.len.split('/').map(Number);
                const partialQuarters = (num && den) ? 4 * num / den : 0;
                ctx.currentTime += partialQuarters;
                spacer = partialDur ? `s${partialDur}` : 's1';
            } else if (ctx.currentTimeSig) {
                const n = parseInt(ctx.currentTimeSig.get('sigN'), 10);
                const d = parseInt(ctx.currentTimeSig.get('sigD'), 10);
                if (n && d) {
                    ctx.currentTime += 4 * n / d;
                    spacer = `s${d}*${n}`;
                } else {
                    ctx.currentTime += 4;
                    spacer = 's1';
                }
            } else {
                ctx.currentTime += 4;
                spacer = 's1';
            }
            const structuralText = nonEmptyVoices.length ? `${nonEmptyVoices.join(' ')} ` : '';
            body = `${measureText} ${structuralText}${spacer}`;
        }
        else if (voicingDecision.type === 'parallel') {
            body = `${measureText} << { ${nonEmptyVoices.join(' } \\\\ { ')} } >>`;
        }
        else {
            // Structural-only voices (KeySig, Clef, ...) go ahead of the one musical voice instead of being dropped.
            const structural = parsedVoices.filter((v, idx) => idx !== voicingDecision.voiceIdx && v && v.trim());
            body = `${measureText} ${[...structural, parsedVoices[voicingDecision.voiceIdx]].join(' ')}`;
        }
        // A `%` line comment runs to the end of the physical line, so the bar
        // number must be the very last thing on it — otherwise it would eat
        // the caller's own bar-check/final barline that follows on the same
        // line (see renderLilypond, which breaks its line before \bar "|."
        // when showBarNumbers is on for exactly this reason).
        return showBarNumbers ? `${body} | % ${barNumber}` : body;
    });
    // Applied identically for every staff regardless of its own content (see
    // render/repeats.js) since the repeat barline spans the whole system.
    // voices are rendered one after another, so tempo marks can have been collected out of time order
    ctx.tempoMap.sort((x, y) => x.at - y.at);
    return { lyrics: ctx.lyrics, music: applyRepeats(ret, repeatRegions) };
}

const renderStaff = (staff, formatVersion, showBarNumbers = false, repeatRegions = []) => {
    const { lyrics, music } = renderMusicForStaff(staff, formatVersion, showBarNumbers, repeatRegions);
    const ret = {
        id: staff.id,
        defaultClef: staff.defaultClef,
        isStaffVisible: staff.isStaffVisible? staff.isStaffVisible[0] : null,
        measures: music,
        lyrics,
    };
    return ret;
}

const diatonics = ['c', 'd', 'e', 'f', 'g', 'a', 'b', 'c'];
const chromatics = [2, 2, 1, 2, 2, 2, 1];

const calculateTransposition = (part) => {
    const instr = part.instrument[0];
    let diatonic = instr.transposeDiatonic;
    let chromatic = Math.abs(instr.transposeChromatic);
    let octaves = 0;
    if (!diatonic && !chromatic) {
        return null; // nothing to do
    }
    // if the diatonic is a multiple of 7 and the chromatic is a multiple of 12, we don't need to transpose
    if (Math.abs(diatonic) % 7 === 0 && Math.abs(chromatic) % 12 === 0) {
        return null;
    }

    // support for transpositions bigger than an octave:
    // first the diatonic and chromatic needs be brought within the octave
    // but we store the amount of octaves we took out
    // we add that to the endnote
    if (Math.abs(diatonic) > 7) {
        octaves = Math.trunc(diatonic / 7); // we want to keep the sign
        diatonic = diatonic % 7;
        chromatic = chromatic % 12; // bring it back to the octave
    }
    // we need to express the transposition through \\transpose and wrap the music in a { } block
    // what we do need to do here though is the c to [x] mapping, the transpose block can be done in renderPart
    // in case of diatonic -1 and chromatic -2, it means c to d (as we inverse)
    // so: diatonic means from c do x steps up => Math.abs(diatonic);
    // chromatic indicates what kind of alteration we need to apply to the diatonic
    // in case of -1, -3 it means c to dis 
    // in case of -2, -3 it means c to es
    const isUp = diatonic > 0; 
    const stepNames = isUp ? [...diatonics].reverse() : diatonics;
    const chromaticValues = isUp ? [...chromatics].reverse() : chromatics;
    // now the process is identical, walk the diatonic steps, calculate the chromatic value
    let totalChromatic = 0;
    let endName = stepNames[Math.abs(diatonic)];
    for (let i = 0; i < Math.abs(diatonic); i++) {
        totalChromatic += chromaticValues[i];
    }
    if (isUp) {
        if (chromatic > totalChromatic) {
            // c is start, need the second name + extension
            if (endName === 'a' || endName === 'e') {
                endName += 's';
            }
            else {
                endName += 'es';
            }
        }
        else if (chromatic < totalChromatic) {
            endName += 'is';
        }
    }
    else {
        if (chromatic > totalChromatic) {
            endName += 'is';
        }
        else if (chromatic < totalChromatic) {
            // c is start, need the second name + extension
            if (endName === 'a' || endName === 'e') {
                endName += 's';
            }
            else {
                endName += 'es';
            }
        }
    }
    if (octaves) {
        if (octaves > 0) {
            endName += `,`.repeat(octaves);
        }
        if (octaves < 0) {
            endName += `'`.repeat(-octaves);
        }
    }
    return `c ${endName}`;
}

const renderLyrics = (lyrics) => {
    const ret = [];
    for (const lyric of lyrics) {
        let lyricText = lyric.text;
        if (typeof lyricText !== 'string') {
            lyricText = lyricText == null ? '' : String(lyricText);
        }
        // anything but a plain word (letters, then letters or simple punctuation) needs quoting in lyricmode
        if (!/^[\p{L}\p{M}][\p{L}\p{M}'\u2019,.!?;:]*$/u.test(lyricText)) {
            lyricText = `"${escapeLilyString(lyricText)}"`;
        }
        ret.push(lyricText);
        if (lyric.syllabic && lyric.syllabic !== 'end' && lyric.syllabic !== 'single') {
            ret.push('--');
        }
    }
    return ret.join(" ");
}

// MuseScore's default staff has 5 lines; only single-line percussion staves
// (and similar non-standard cases) carry an explicit <lines> override.
export const renderStaffOpen = (lineCount) => {
    if (!lineCount || lineCount === 5) {
        return '\\new Staff {\n';
    }
    return `\\new Staff \\with {\n    \\override StaffSymbol.line-count = #${lineCount}\n} {\n`;
}

const renderPart = (part, formatVersion, showBarNumbers = false, repeatRegions = [], partName = part.trackName) => {
    const longName = part.instrument[0].longName;
    const shortName = part.instrument[0].shortName;
    const transposition = calculateTransposition(part);
    const ret = {
        musicData: {},
        scoreData: [], // in the score, the order does matter
        partData: {},
        lyricData: [],
    };
    if (part.staffs.length > 1) {
        // we need to render multiple staffs
        // we need to make a macro for the contents of each staff
        const renderedStaffs = part.staffs.map((staff) => renderStaff(staff, formatVersion, showBarNumbers, repeatRegions));
        // lets assume a piano for now
        // this means one staff is treble and one is bass
        // we need to abstract the data for the staffs first
        // because we need the names of the macros
        let tmpScoreData = "\\new PianoStaff <<\n";
        tmpScoreData += `    \\set PianoStaff.instrumentName = "${escapeLilyString(longName)}"\n`;
        tmpScoreData += `    \\set PianoStaff.shortInstrumentName = "${escapeLilyString(shortName)}"\n`;
        renderedStaffs.forEach((staff, idx) => {
            const partDataName = musicIdentifiers(partName, part.staffs.length)[idx];
            ret.musicData[`${partDataName}`] = staff.measures;
            const clefname = renderClef(staff.defaultClef);
            tmpScoreData += renderStaffOpen(part.staffs[idx].lineCount);
            tmpScoreData += `    ${clefname} \n`;
            if (transposition) tmpScoreData += `    \\transpose ${transposition} { \n`;
            tmpScoreData += `    \\${partDataName}\n`; 
            if (transposition) tmpScoreData += `    }\n`;
            tmpScoreData += `}\n`;
            ret.lyricData.push(staff.lyrics);
        });
        tmpScoreData += ">>\n";
        ret.scoreData.push(tmpScoreData);
        ret.partData[partName] = tmpScoreData; 
    }
    else {
        const renderedStaff = renderStaff(part.staffs[0], formatVersion, showBarNumbers, repeatRegions);
        const staffHasLyrics = renderedStaff.lyrics && renderedStaff.lyrics.length;
        const partDataName = musicIdentifiers(partName, 1)[0];
        ret.musicData[partDataName] = renderedStaff.measures;
        const clefname = renderClef(part.staffs[0].defaultClef);
        // render the score contents for the Score 
        let tmpScoreData = `  ${renderStaffOpen(part.staffs[0].lineCount)}`;
        tmpScoreData += `    \\set Staff.instrumentName = "${escapeLilyString(longName)}"\n`;
        tmpScoreData += `    \\set Staff.shortInstrumentName = "${escapeLilyString(shortName)}"\n`;
        tmpScoreData += `    ${clefname} \n`;
        if (staffHasLyrics) {
            tmpScoreData += `     \\new Voice = "${partDataName}" {\n`;
        }
        if (transposition) tmpScoreData += `    \\transpose ${transposition} { \n`;
        tmpScoreData += `    \\${partDataName}\n`;
        if (transposition) tmpScoreData += `    }\n`;
        if (staffHasLyrics) {
            tmpScoreData += `     }\n`;
        }
        tmpScoreData += '  }\n';
        if (staffHasLyrics) {
            tmpScoreData += `   \\new Lyrics \\lyricsto "${partDataName}" { \n `;
            // write out lyrics
            tmpScoreData += `      ${renderLyrics(renderedStaff.lyrics)} \n   } \n`;
        }
        ret.scoreData.push(tmpScoreData);

        // render the score contents for sthe separate part
        let tmpPartData = renderStaffOpen(part.staffs[0].lineCount);
        if (transposition) tmpPartData += `    \\transpose ${transposition} { \n`;
        tmpPartData += `${clefname} \n`;
        if (staffHasLyrics) tmpPartData += `     \\new Voice = "${partDataName}" {\n`;
        tmpPartData += `   \\${partDataName } \n`;
        if (staffHasLyrics) tmpPartData += `     }\n`;
        if (transposition) tmpPartData += `    }\n`;
        tmpPartData += `}\n`;
        if (staffHasLyrics) {
            tmpPartData += `   \\new Lyrics \\lyricsto "${partDataName}" { \n `;
            // write out lyrics
            tmpPartData += `      ${renderLyrics(renderedStaff.lyrics)} \n   } \n`;
            // staff and lyrics must run simultaneously inside the part's \score
            tmpPartData = `<<\n${tmpPartData}>>\n`;
        }

        ret.partData[partName] = tmpPartData;
        ret.lyricData.push(renderedStaff.lyrics);
    }
    return ret;
}


// The music identifiers a part defines: one per staff, numbered when it has several.
export const musicIdentifiers = (partName, staffCount) => staffCount > 1
    ? Array.from({ length: staffCount }, (_, i) => createValidPartName(`${partName}${i + 1}`))
    : [createValidPartName(partName)];

// Gives every part a name that is unique in every place it is used: the music identifiers
// (one per staff), the part book key / output suffix, and the lyric timing key.
// Parts that share a (valid-identifier) name all get a running number appended
// (flute -> flute1, flute2); other parts keep their name unless it, or one of their
// identifiers, is already used by another part (e.g. a two-staff "Piano" and a part named "Piano1").
export const createPartNamer = (partsInfo) => {
    const parts = partsInfo.flatMap(p => p.isSection ? p.parts : [p]);
    const nameOf = (part) => part.trackName || 'Part';
    const totals = {};
    parts.forEach((p) => {
        const base = createValidPartName(nameOf(p));
        totals[base] = (totals[base] || 0) + 1;
    });
    const takenIds = new Set();
    const takenNames = new Set(); // lowercase: the names end up in file names
    const isFree = (name, ids) => !takenNames.has(name.toLowerCase()) && ids.every((id) => !takenIds.has(id));
    const claim = (name, ids) => {
        takenNames.add(name.toLowerCase());
        ids.forEach((id) => takenIds.add(id));
    };
    // reserved up front so generated numbers can never take a name another part really has
    const keepsName = new Set();
    parts.forEach((part) => {
        if (totals[createValidPartName(nameOf(part))] !== 1) return;
        const ids = musicIdentifiers(nameOf(part), part.staffs.length);
        if (!isFree(nameOf(part), ids)) return;
        claim(nameOf(part), ids);
        keepsName.add(part);
    });
    const counters = {};
    return (part) => {
        if (keepsName.has(part)) return nameOf(part);
        const base = createValidPartName(nameOf(part));
        let name, ids;
        do {
            counters[base] = (counters[base] || 0) + 1;
            name = `${nameOf(part)}${counters[base]}`;
            ids = musicIdentifiers(name, part.staffs.length);
        } while (!isFree(name, ids));
        claim(name, ids);
        return name;
    };
};

export const renderLilypond = (partsInfo, metaInfo, options = {}, formatVersion = LATEST_FORMAT_VERSION, repeatRegions = []) => {
    // there are two parts we are going to render
    // the parts music library, the score and possibly the parts (which can be part of the same file)
    const data = {
        musicData: {},
        scoreData: [], // in the score, the order does matter
        partData: {},
    };
    const uniqueName = createPartNamer(partsInfo);
    partsInfo.forEach((partInfo) => {
        if (partInfo.isSection) {
            const parts = partInfo.parts.map((part) => {
                return renderPart(part, formatVersion, options.showBarNumbers, repeatRegions, uniqueName(part));
            });
            // we can now copy the musicdata to the data.musicData
            let ret = "  \\new StaffGroup <<\n";
            parts.forEach((part) => {
                Object.keys(part.musicData).forEach((key) => {
                    data.musicData[key] = part.musicData[key];
                });
                Object.keys(part.scoreData).forEach((key) => {
                    ret += `  ${part.scoreData[key]}\n`;
                });
                Object.keys(part.partData).forEach((key) => {
                    data.partData[key] = part.partData[key];
                });
            });
            ret += "  >>\n";
            data.scoreData.push(ret);
        }
        else {
            // not a section, but a part
            const part = renderPart(partInfo, formatVersion, options.showBarNumbers, repeatRegions, uniqueName(partInfo));
            Object.assign(data.musicData, part.musicData);
            Object.assign(data.partData, part.partData);
            data.scoreData.push(part.scoreData);
        }   
    });

    let music = "";
    // When bar numbers are on, each measure already ends with its own
    // `| % N` line comment (see renderMusicForStaff), so the join must not
    // add its own ` |` too — that would land after the `%` and just be dead
    // text sitting past the end of a line that's supposed to end with the
    // bar number. Likewise \bar "|." needs a fresh line of its own, or it
    // would get swallowed into the last measure's comment.
    const measureJoin = options.showBarNumbers ? '\n  ' : ' |\n  ';
    const finalBarLead = options.showBarNumbers ? '\n ' : ' ';
    Object.keys(data.musicData).forEach((key) => {
        music += `${key} = { \n ${data.musicData[key].join(measureJoin)}${finalBarLead}\\bar "|."\n}\n`;
    });
    let parts = "";
    Object.keys(data.partData).forEach((key) => {
        parts += "\\book {\n";
        if (options.partsPaperSize) {
            parts += ` \\paper {\n   #(set-paper-size "${escapeLilyString(options.partsPaperSize)}")\n }\n`;
        }
        parts += `  \\bookOutputSuffix "${escapeLilyString(key)}"\n`;
        parts += `  \\header {\n`;
        if (metaInfo.workTitle) {
            parts += `    title = "${escapeLilyString(metaInfo.workTitle)}"\n`;
        }   
        if (metaInfo.subtitle) {
            parts += `    subtitle = "${escapeLilyString(metaInfo.subtitle)}"\n`;
        }
        if (metaInfo.composer) {
            parts += `    composer = "${escapeLilyString(metaInfo.composer)}"\n`;
        }
        if (metaInfo.lyricist) {
            parts += `    lyricist = "${escapeLilyString(metaInfo.lyricist)}"\n`;
        }
        if (metaInfo.arranger) {
            parts += `    arranger = "${escapeLilyString(metaInfo.arranger)}"\n`;
        }
        // instrument name
        parts += `    instrument = "${escapeLilyString(key)}"\n`;
        parts += "  }\n";
        parts += "  \\score {\n"
        parts += `     ${data.partData[key]}\n`
        if (options.partsStaffSize) {
            parts += "   \\layout {\n";
            parts += `      #(layout-set-staff-size ${options.partsStaffSize})\n`;
            parts += "   }\n";
        }
        parts += "  }\n";
        parts += "}\n";
    });

    let score = "\\book {\n";
    if (options.scorePaperSize) {
        score += ` \\paper {\n   #(set-paper-size "${escapeLilyString(options.scorePaperSize)}")\n }\n`;
    }
    score += `  \\header {\n`;
    if (metaInfo.workTitle) {
        score += `    title = "${escapeLilyString(metaInfo.workTitle)}"\n`;
    }   
    if (metaInfo.subtitle) {
        score += `    subtitle = "${escapeLilyString(metaInfo.subtitle)}"\n`;
    }
    if (metaInfo.composer) {
        score += `    composer = "${escapeLilyString(metaInfo.composer)}"\n`;
    }
    if (metaInfo.lyricist) {
        score += `    lyricist = "${escapeLilyString(metaInfo.lyricist)}"\n`;
    }
    if (metaInfo.arranger) {
        score += `    arranger = "${escapeLilyString(metaInfo.arranger)}"\n`;
    }
    score += "  }\n";
    score += "  \\score { <<\n";
    data.scoreData.forEach((part) => {
        score += part;
    });
    score += "    >>\n";
    if (options.scoreStaffSize) {
        score += "   \\layout {\n";
        score += `      #(layout-set-staff-size ${options.scoreStaffSize})\n`;
        score += "   }\n";
    }
    score += "  }\n";
    score += "}\n"; // book end

    return {
        music,
        parts,
        score
    }
}

/**
 * 
 * @param {XmlWrapper} data MuseScore XML data converted to JS
 * @returns 
 */
export const convertMSCX2LY = (data, options = {}) => {
    // step 1: Order
    // this is a list of instruments used, and adds the family attribute to the instruments
    // it also describes the sections of the score by family
    const Score = data.get('Score');
    const orderInfo = readOrderInfo(Score.get('Order'));
    // step 2: Staff
    const staffInfo = readStaffInfo(Score.get('Staff'));
    // repeat/volta markers may live on only one staff of a system (see
    // render/repeats.js), so they're merged across all staves once, up front,
    // and applied identically to every staff during rendering.
    const repeatRegions = analyzeRepeats(mergeRepeatMarkers(staffInfo.filter(Boolean).map((staff) => staff.Measure)));
    // step 3: the parts
    const partsInfo = readPartsInfo(Score.get('Part'), orderInfo, staffInfo);
    // step 4: the meta info
    const metaInfo = parseMetaTag(Score.get('metaTag'));
    const { formatVersion } = detectVersion(data);
    // with the parts info we have the parts in the order they are in the score
    // now we can start generating the lilypond structure
    // we will go throught the parts, section by section, and generate the lilypond structure and data
    const lilypondData = renderLilypond(partsInfo, metaInfo, options, formatVersion.value, repeatRegions);
    return lilypondData;
}

export const renderLyricTimings = (data ) => {
    const Score = data.get('Score');
    const orderInfo = readOrderInfo(Score.get('Order'));
    // step 2: Staff
    const staffInfo = readStaffInfo(Score.get('Staff'));
    // step 3: the parts
    const partsInfo = readPartsInfo(Score.get('Part'), orderInfo, staffInfo);
    // step 4: the meta info
    // const metaInfo = parseMetaTag(Score.get('metaTag'));
    const { formatVersion } = detectVersion(data);
    const ret = {};
    const uniqueName = createPartNamer(partsInfo);
    partsInfo.flatMap(p => p.isSection ? p.parts : [p]).forEach((part) => {
        const name = uniqueName(part);
        const { lyricData } = renderPart(part, formatVersion.value, false, [], name);
        lyricData.forEach((staffLyrics) => {
            staffLyrics.forEach(lyric => {
                lyric.end = Math.max(lyric.end, lyric.melismaEnd ?? 0);
                if (!lyric.tempoMap || !lyric.tempoMap.length) {
                    lyric.startMs = null;
                    lyric.endMs = null;
                    return;
                }
                lyric.startMs = quartersToMs(lyric.start, lyric.tempoMap);
                lyric.endMs = quartersToMs(lyric.end, lyric.tempoMap);
            });
        });
        ret[name] = lyricData;
    });
    return ret;
}
