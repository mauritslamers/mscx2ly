import { XmlWrapper } from "./xml_wrapper.js";

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
    if (concertKey > 0) {
        return posKeySigs[concertKey];
    }
    return negKeySigs[-concertKey];
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
    return `\\time ${n}/${d}`;
}


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
}

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
    return validPartName;
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

    const duration = durationMap[restDuration];
    if (!duration) {
        throw new Error(`Unknown duration: ${restDuration}`);
    }
    if (rest.get('durationType') === "measure") {
        return `R${duration}`;
    }
    else {
        return `r${duration}`;
    }
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
    "articLaisserVibrer": "\\laisserVibrer",
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
export const parseChord = (chord, timeSig, keySig) => {
    const dur = durationMap[chord.get('durationType')];
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
    if (hasTie) {
        ret += ' ~';
    }
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

export const readPartInfo = (part, staffInfo) => {
    // this returns an object with the information of the part
    let instruments = part.get('Instrument');
    if (!Array.isArray(instruments)) {
        instruments = [instruments];
    }
    const ret = {};
    ret.id = part.get('id');
    ret.trackName = part.get('trackName');
    ret.instrument = instruments.map((instrument) => {
        let instrChannel = instrument.get('Channel');
        if (!Array.isArray(instrChannel)) {
            instrChannel = [instrChannel];
        }
        return {
            id: instrument.get('id'),
            longName: instrument.get('longName'),
            shortName: instrument.get('shortName'),
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
    ret.staffs = staffs.map((staff) => {
        const staffContents = staffInfo.find((staffdata) => {
            return staffdata.id === staff.get('id');
        });
        let defaultConcertClef = staff.get('defaultConcertClef')? staff.get('defaultConcertClef') : null;
        let defaultClef = staff.get('defaultClef')? staff.get('defaultClef') : defaultConcertClef;
        return {
            id: staff.get('id'),
            StaffType: staff.get('StaffType'),
            isStaffVisible: staff.get('isStaffVisible'),
            barLineSpan: staff.get('barLineSpan'),
            defaultClef,
            contents: staffContents.Measure,
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
export const readPartsInfo = (parts, orderInfo, staffInfo) => {
    // this returns an object with the part name as key
    // and any staffs used in the part, plus other information
    
    // sadly the instruments in the orderInfo is not ordered as in the score
    // also, the order is inconclusive based on the info available in the orderInfo
    // there is no direct evidence why the string instruments are below the keyboards
    if (!Array.isArray(parts)) {
        parts = [parts];
    }
    // so we better go by parts, find sections they could belong to, and wrap them that way.
    const partsInfo = parts.map((part) => {
        return readPartInfo(part, staffInfo);
    });
    // per part we need to find:
    // - sections
    // - multiple staffs
    
    let ret = [];
    let currentSection = {
        isSection: true,
        id: null,
        parts: []
    };
    partsInfo.forEach((partInfo) => {
        // we trust the order of the instruments in the partInfo
        // take the instrumentId
        // console.log('part:', partInfo.trackName);
        const instrumentId = partInfo.instrument[0].instrumentId;
        // console.log('instrumentId:', instrumentId);
        const section = orderInfo.sections.find((section) => {
            const sharesSectionFamilies = section.family.some((family) => {
                return instrumentId.includes(family);
            });
            const sharesSectionId = instrumentId.includes(section.id);
            return sharesSectionFamilies || sharesSectionId;
        });
        if (section) {
            // console.log('found section for part:', partInfo.trackName, section.id);
            if (currentSection.id === section.id) {
                // we are still in the same section
                currentSection.parts.push(partInfo);
            }
            else {
                // we are in a new section
                if (currentSection.id && currentSection.id !== section.id) {
                    // we need to close the current section
                    // console.log('closing section:', currentSection.id);
                    ret.push(currentSection);
                }
                // we start a new section
                currentSection = {
                    id: section.id,
                    isSection: true,
                    parts: [partInfo]
                }
            }
        }
        else {
            // no problem, it is then not part of a section
            // we add it straight
            // console.log('no section for part:', partInfo.trackName);
            ret.push(partInfo);
        }
    });
    // we need to close the last section
    if (currentSection.id) {
        // console.log('closing section:', currentSection.id);
        ret.push(currentSection);
    }
    // console.log('ret:', ret);
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
    instruments.map((instrument) => {
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
    const sections = order.get('section').map((section) => {
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
export const readStaffInfo = (staffs) => {
    if (!Array.isArray(staffs)) {
        staffs = [staffs];
    }
    return staffs.map((staff) => {
        
        const ret = {
            id: staff.get('id'),
            Measure: staff.get('Measure').map((measure) => {
                let voices = measure.get('voice');
                if (!Array.isArray(voices)) {
                    voices = [voices];
                }
                return {
                    irregular: measure.get('irregular'),
                    len: measure.get('len'),
                    voice: voices.map((voice) => {
                        // the purpose here is a filter to only get the relevant information
                        // now order becomes important, so we use the children instead.
                        return voice.children.filter((child) => {
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
                                'PlayTechAnnotation' // this is for pizz and arco
                            ].includes(child.name);
                        });
                    })
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

export const renderHairPin = (spanner) => {
    const isEnd = !!spanner.get('prev');
    if (isEnd) { 
        return "\\!";
    }
    const hairpin = spanner.get('HairPin'); // this will be null when isEnd
    const isStart = !!spanner.get('next');
    const subType = hairpin.get('subtype'); // 0 for cresc, 1 for decresc
    const type = subType === '0'? '\\<' : '\\>';
    return type;
}


export const renderSpanner = (spanner) => {
    const type = spanner.get('type'); // xml attribute
    const typeObject = spanner.get(type); // xml object named after the xml attribute type
    const isStart = !!spanner.get('next');
    const isEnd = !!spanner.get('prev');
    if (!typeObject && !isEnd) {
        // this means that the spanner does not exist as a subchild
        console.log('spanner type not found:', type);
        return "";
    }
    if (type === 'HairPin') {
        return renderHairPin(spanner);
    }
}

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
        case 'pf': ret = '\\pf'; break;
        case 'sf': ret = '\\sf'; break;
        case 'sfz': ret = '\\sfz'; break;
        case 'sff': ret = '\\sff'; break;
        case 'sffz': ret = '\\sffz';
        case 'sfp': ret = '\\sfp'; break;
        case 'rfz': ret = '\\rfz'; break;
        case 'rf': ret = '\\rf'; break;
        case 'fz': ret = '\\fz'; break;        
    }
    return ret;
}


export const renderMusicForStaff = (staffContents) => {
    let currentKeySig = null;
    let currentTimeSig = null;
    const ret = staffContents.map((measure) => {
        // TODO: we need to do something about the transposition
        let measureText = "";
        if (measure.len) {
            // we assume a \partial for now
            measureText += `\\partial ${durationMap[measure.len]}`;
        }
        const voices = measure.voice;
        const parsedVoices = voices.map((voice) => {
            // we need to keep the fermata, as in Lilypond it should always follow the event it is attached to
            const voiceConsumer = new OnceConsumer('lifo');
            return voice.map((evt) => {
                switch (evt.name) {
                    case 'KeySig': {
                        currentKeySig = evt;
                        return renderKeySig(evt);
                    }
                    case 'TimeSig': {
                        currentTimeSig = evt;
                        return parseTimeSig(evt);
                    }
                    case 'Rest': {
                        let renderedRest = parseRest(evt, currentTimeSig);
                        if (voiceConsumer.has('dynamic')) {
                            renderedRest = `${renderedRest}${voiceConsumer.get('dynamic')}`;
                        }
                        if (voiceConsumer.has('spanner')) {
                            renderedRest = `${renderedRest}${voiceConsumer.get('spanner')}`;
                        }
                        if (voiceConsumer.has('text')) {
                            renderedRest = `${renderedRest}${voiceConsumer.get('text')}`;
                        }
                        if (voiceConsumer.has('fermata')) {
                            renderedRest = `${renderedRest}${voiceConsumer.get('fermata')}`;
                        }
                        return renderedRest;
                    }
                    case 'Chord': {
                        let renderedChord = parseChord(evt, currentTimeSig, currentKeySig);
                        if (voiceConsumer.has('dynamic')) {
                            renderedChord = `${renderedChord}${voiceConsumer.get('dynamic')}`;
                        }
                        if (voiceConsumer.has('spanner')) {
                            renderedChord = `${renderedChord}${voiceConsumer.get('spanner')}`;
                        }
                        if (voiceConsumer.has('text')) {
                            renderedChord = `${renderedChord}${voiceConsumer.get('text')}`;
                        }
                        if (voiceConsumer.has('fermata')) {
                            renderedChord = `${renderedChord}${voiceConsumer.get('fermata')}`;
                        }
                        return renderedChord;
                    }
                    case 'Clef': {
                        const clef = evt.get('concertClefType') || evt.get('transposingClefType');
                        return renderClef(clef);
                    }
                    case 'BarLine': {
                        return renderBarLine(evt);
                    }
                    case 'Fermata': {	
                        voiceConsumer.set('fermata', renderFermata(evt));
                        break;
                    }
                    case 'PlayTechAnnotation': {
                        const text = `^\\markup { \\italic ${evt.get('text')} }`;
                        voiceConsumer.set('text', text);
                        break;
                    }
                    case 'Spanner': {
                        const spanner = renderSpanner(evt);
                        voiceConsumer.set('spanner', spanner);
                        break;
                    }
                    case 'Dynamic': {
                        const dynamic = renderDynamic(evt);
                        voiceConsumer.set('dynamic', dynamic);
                        break;
                    }
                    default: return '';
                }
            }).join(' ');
        });
        if (parsedVoices.length > 1) {
            return `${measureText} << { ${parsedVoices.join(' } \\\\ { ')} } >>`;
        }
        return `${measureText} ${parsedVoices[0]}`;
    });
    return ret;
}

const renderStaff = (staff) => {
    const ret = {
        id: staff.id,
        defaultClef: staff.defaultClef,
        isStaffVisible: staff.isStaffVisible? staff.isStaffVisible[0] : null,
        measures: renderMusicForStaff(staff.contents)
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
        octaves = Math.floor(diatonic / 7); // we want to keep the sign
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
    const stepNames = isUp? diatonics.reverse() : diatonics;
    const chromaticValues = isUp > 0? chromatics.reverse() : chromatics;
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
            endName += `'`.repeat(octaves);
        }
    }
    return `c ${endName}`;
}


const renderPart = (part) => {
    const partName = part.trackName;
    const longName = part.instrument[0].longName;
    const shortName = part.instrument[0].shortName;
    const transposition = calculateTransposition(part);
    const ret = {
        musicData: {},
        scoreData: [], // in the score, the order does matter
        partData: {}
    };
    if (part.staffs.length > 1) {
        // we need to render multiple staffs
        // we need to make a macro for the contents of each staff
        const renderedStaffs = part.staffs.map(renderStaff);
        // lets assume a piano for now
        // this means one staff is treble and one is bass
        // we need to abstract the data for the staffs first
        // because we need the names of the macros
        let tmpScoreData = "\\new PianoStaff <<\n";
        tmpScoreData += `    \\set PianoStaff.instrumentName = "${longName}"\n`;
        tmpScoreData += `    \\set PianoStaff.shortInstrumentName = "${shortName}"\n`;
        renderedStaffs.forEach((staff, idx) => {
            const partDataName = createValidPartName(`${partName}${idx+1}`);
            ret.musicData[`${partDataName}`] = staff.measures;
            const clefname = renderClef(staff.defaultClef);
            tmpScoreData += "\\new Staff {\n";
            tmpScoreData += `    ${clefname} \n`;
            if (transposition) tmpScoreData += `    \\transpose ${transposition} { \n`;
            tmpScoreData += `    \\${partDataName}\n`; 
            if (transposition) tmpScoreData += `    }\n`;
            tmpScoreData += `}\n`;
        });
        tmpScoreData += ">>\n";
        ret.scoreData.push(tmpScoreData);
        ret.partData[partName] = tmpScoreData; 
    }
    else {
        const renderedStaff = renderStaff(part.staffs[0]);
        const partDataName = createValidPartName(partName);
        ret.musicData[partDataName] = renderedStaff.measures;
        const clefname = renderClef(part.staffs[0].defaultClef);
        let tmpScoreData = "  \\new Staff {\n";
        tmpScoreData += `    \\set Staff.instrumentName = "${longName}"\n`;
        tmpScoreData += `    \\set Staff.shortInstrumentName = "${shortName}"\n`;
        tmpScoreData += `    ${clefname} \n`;
        if (transposition) tmpScoreData += `    \\transpose ${transposition} { \n`;
        tmpScoreData += `    \\${partDataName}\n`;
        if (transposition) tmpScoreData += `    }\n`;
        tmpScoreData += '  }\n';
        ret.scoreData.push(tmpScoreData);
        let tmpPartData = `\\new Staff { \n`;
        if (transposition) tmpPartData += `    \\transpose ${transposition} { \n`;
        tmpPartData +=  `${clefname} \n   \\${partDataName } \n`;
        if (transposition) tmpPartData += `    }\n`;
        tmpPartData += `}\n`;
        ret.partData[partName] = tmpPartData;
    }
    return ret;
}


export const renderLilypond = (partsInfo, metaInfo, options = {}) => {
    // there are two parts we are going to render
    // the parts music library, the score and possibly the parts (which can be part of the same file)
    const data = {
        musicData: {},
        scoreData: [], // in the score, the order does matter
        partData: {}
    };
    const musicKeyCount = {};
    const partKeyCount = {};
    partsInfo.forEach((partInfo) => {
        if (partInfo.isSection) {
            const parts = partInfo.parts.map((part) => {
                return renderPart(part, data);
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
            const part = renderPart(partInfo, data);
            // we can now copy the musicdata to the data.musicData
            
            Object.keys(part.musicData).forEach((key) => {
                if (!data.musicData[key]) {
                    data.musicData[key] = part.musicData[key];
                    musicKeyCount[key] = 1;
                }
                else {
                    musicKeyCount[key] += 1;
                    const newKey = createValidPartName(`${key}${musicKeyCount[key]}`);
                    data.musicData[newKey] = part.musicData[key];
                }
            });
            Object.keys(part.partData).forEach((key) => {
                if (!data.partData[key]) {
                    data.partData[key] = part.partData[key];
                    partKeyCount[key] = 1;
                }
                else {
                    partKeyCount[key] += 1;
                    const newKey = createValidPartName(`${key}${partKeyCount[key]}`);
                    data.partData[newKey] = part.partData[key];
                }
            });
            data.scoreData.push(part.scoreData);
        }   
    });

    let music = "";
    Object.keys(data.musicData).forEach((key) => {
        music += `${key} = { \n ${data.musicData[key].join(' |\n  ')} \\bar "|."\n}\n`;
    });
    let parts = "";
    Object.keys(data.partData).forEach((key) => {
        parts += "\\book {\n";
        if (options.partsPaperSize) {
            parts += ` \\paper {\n   #(set-paper-size "${options.partsPaperSize}")\n }\n`;
        }
        parts += `  \\bookOutputSuffix "${key}"\n`;
        parts += `  \\header {\n`;
        if (metaInfo.workTitle) {
            parts += `    title = "${metaInfo.workTitle}"\n`;
        }   
        if (metaInfo.subtitle) {
            parts += `    subtitle = "${metaInfo.subtitle}"\n`;
        }
        if (metaInfo.composer) {
            parts += `    composer = "${metaInfo.composer}"\n`;
        }
        if (metaInfo.lyricist) {
            parts += `    lyricist = "${metaInfo.lyricist}"\n`;
        }
        if (metaInfo.arranger) {
            parts += `    arranger = "${metaInfo.arranger}"\n`;
        }
        // instrument name
        parts += `    instrument = "${key}"\n`;
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
        score += ` \\paper {\n   #(set-paper-size "${options.scorePaperSize}")\n }\n`;
    }
    score += `  \\header {\n`;
    if (metaInfo.workTitle) {
        score += `    title = "${metaInfo.workTitle}"\n`;
    }   
    if (metaInfo.subtitle) {
        score += `    subtitle = "${metaInfo.subtitle}"\n`;
    }
    if (metaInfo.composer) {
        score += `    composer = "${metaInfo.composer}"\n`;
    }
    if (metaInfo.lyricist) {
        score += `    lyricist = "${metaInfo.lyricist}"\n`;
    }
    if (metaInfo.arranger) {
        score += `    arranger = "${metaInfo.arranger}"\n`;
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
    // step 3: the parts
    const partsInfo = readPartsInfo(Score.get('Part'), orderInfo, staffInfo);
    // step 4: the meta info
    const metaInfo = parseMetaTag(Score.get('metaTag'));
    // with the parts info we have the parts in the order they are in the score
    // now we can start generating the lilypond structure
    // we will go throught the parts, section by section, and generate the lilypond structure and data
    const lilypondData = renderLilypond(partsInfo, metaInfo, options);
    return lilypondData;
}