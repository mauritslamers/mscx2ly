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
    "2/2": "2",
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
    "articStaccatoBelow": "-."
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
    const notes = noteInfo.map((note) => {
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
                            return ['KeySig', 'TimeSig', 'Tempo', 'Rest', 'Dynamic', 'Spanner', 'Chord', 'Barline', 'VBox', 'Clef'].includes(child.name);
                        });
                        // 
                        // return {
                        //     KeySig: voice.KeySig,
                        //     TimeSig: voice.TimeSig,
                        //     Tempo: voice.Tempo,
                        //     Rest: voice.Rest,
                        //     Dynamic: voice.Dynamic,
                        //     Spanner: voice.Spanner,
                        //     Chord: voice.Chord,
                        //     Barline: voice.Barline,
                        // }
                    })
                }
            })
        }
        return ret;
    });
};

export const renderMusicForStaff = (staffContents) => {
    let currentKeySig = null;
    let currentTimeSig = null;
    const ret = staffContents.map((measure) => {
        let measureText = "";
        if (measure.len) {
            // we assume a \partial for now
            measureText += `\\partial ${durationMap[measure.len]}`;
        }
        const voices = measure.voice;
        const parsedVoices = voices.map((voice) => {
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
                        return parseRest(evt, currentTimeSig);
                    }
                    case 'Chord': {
                        return parseChord(evt, currentTimeSig, currentKeySig);
                    }
                    case 'Clef': {
                        const clef = evt.get('concertClefType') || evt.get('transposingClefType');
                        return renderClef(clef);
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

const renderPart = (part) => {
    const partName = part.trackName;
    const longName = part.instrument[0].longName;
    const shortName = part.instrument[0].shortName;
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
            tmpScoreData += `    \\${partDataName}\n`; 
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
        tmpScoreData += `    \\${partDataName}\n`;
        tmpScoreData += '  }\n';
        ret.scoreData.push(tmpScoreData);
        ret.partData[partName] = `\\new Staff { \\${partDataName} }\n`;
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