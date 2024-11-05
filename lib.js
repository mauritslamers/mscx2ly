/** 
 * @param {MetaTag} metaTag 
 * @returns {FlatMetaTag}
 */
export const parseMetaTag = (metaTag) => {
    const ret = {};
    metaTag.forEach((tag) => {
        ret[tag.$.name] = tag._;
    });
    return ret;
}

const posKeySigs = ['C', 'G', 'D', 'A', 'E', 'B', 'Fis', 'Cis'];
const negKeySigs = ['C', 'F', 'Bes', 'Es', 'As', 'Des', 'Ges', 'Ces'];
/**
 * 
 * @param {KeySig} keySig 
 * @returns {string} Lilypond note name for key signature in major
 */
export const parseKeySig = (keySig) => {
    const concertKey = keySig.concertKey[0];
    if (concertKey > 0) {
        return posKeySigs[concertKey];
    }
    return negKeySigs[-concertKey];
}

/**
 * 
 * @param {KeySig} keySig 
 * @returns {string} Lilypond code for key signature
 */
export const renderKeySig = (keySig) => {
    return `\\key ${parseKeySig(keySig).toLocaleLowerCase()} \\major`;
}

/**
 * 
 * @param {TimeSig} timeSig 
 */
const parseTimeSig = (timeSig) => {
    return `\\time ${timeSig.sigN[0]}/${timeSig.sigD[0]}`;
}


const durationMap = {
    "1/64": "64",
    "1/32": "32",
    "1/16": "16",
    "1/8": "8",
    "1/4": "4",
    "1/2": "2",
    "1": "1",
    "2/4": "2",
    "3/4": "2.",
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
    const restDuration = rest.duration? rest.duration[0] : rest.durationType[0];

    const duration = durationMap[restDuration];
    if (!duration) {
        throw new Error(`Unknown duration: ${restDuration}`);
    }
    if (rest.durationType[0] === "measure") {
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
    const concertKey = keySig.concertKey[0];
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
    const base = convertMidiPitchToNoteName(note.pitch[0], keySig);
    if (note.Accidental) {
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
    // console.log('chord:', chord);
    const dur = durationMap[chord.durationType[0]];
    const dots = chord.dots? parseInt(chord.dots[0], 10) : 0;
    const duration = dur + '.'.repeat(dots);

    const notes = chord.Note.map((note) => {
        return parseNote(note, keySig);
    });

    if (notes.length > 1) {
        return `<${notes.join(' ')}>${duration}`;
    }
    return notes[0] + duration;
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
    const ret = {};
    ret.id = part.$.id;
    ret.trackName = part.trackName[0];
    ret.instrument = part.Instrument.map((instrument) => {
        return {
            id: instrument.$.id,
            longName: instrument.longName,
            shortName: instrument.shortName,
            trackName: instrument.trackName,
            minPitchP: instrument.minPitchP,
            maxPitchP: instrument.maxPitchP,
            minPitchA: instrument.minPitchA,
            maxPitchA: instrument.maxPitchA,
            instrumentId: instrument.instrumentId,
            clef: instrument.clef,
            Channel: instrument.Channel.map((channel) => {
                return {
                    synti: channel.synti,
                    midiPort: channel.midiPort,
                    midiChannel: channel.midiChannel,
                    program: channel.program.map((program) => {
                        return {
                            value: program.$.value
                        }
                    })
                }
            })
        }
    });
    ret.staffs = part.Staff.map((staff) => {
        const staffContents = staffInfo.find((staffdata) => {
            return staffdata.id === staff.$.id;
        });
        return {
            id: staff.$.id,
            StaffType: staff.StaffType,
            isStaffVisible: staff.isStaffVisible,
            barLineSpan: staff.barLineSpan,
            defaultClef: staff.defaultClef || staff.defaultConcertClef || ['G'],
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
        const instrumentId = partInfo.instrument[0].instrumentId[0];
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
    // first: instruments
    const instruments = order.instrument.map((instrument) => {
        return {
            id: instrument.$.id,
            family: instrument.family.map((family) => {
                return {
                    id: family.$.id,
                    name: family._
                }
            })
        }
    });
    // second: sections
    const sections = order.section.map((section) => {
        return {
            id: section.$.id,
            brackets: section.$.brackets === 'true',
            barLineSpan: section.$.barLineSpan === 'true',
            thinBrackets: section.$.thinBrackets === 'true',
            family: section.family,
            unsorted: section.unsorted? section.unsorted.map((unsorted) => {
                return {
                    group: unsorted.$.group
                }
            }) : []
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
 * @param {ScoreStaff} staffs 
 * @returns {FlatScoreStaff} reduced staff info
 */
export const readStaffInfo = (staffs) => {
    return staffs.map((staff) => {
        
        const ret = {
            id: staff.$.id,
            Measure: staff.Measure.map((measure) => {
                return {
                    voice: measure.voice.map((voice) => {
                        return {
                            KeySig: voice.KeySig,
                            TimeSig: voice.TimeSig,
                            Tempo: voice.Tempo,
                            Rest: voice.Rest,
                            Dynamic: voice.Dynamic,
                            Spanner: voice.Spanner,
                            Chord: voice.Chord
                        }
                    })
                }
            })
        }
        if (staff.VBox) {
            ret.VBox = staff.VBox.map((vbox) => {
                return {
                    height: vbox.height,
                    eid: vbox.eid,
                    linkedMain: vbox.linkedMain,
                    Text: vbox.Text.map((text) => {
                        return {
                            eid: text.eid,
                            linkedMain: text.linkedMain,
                            style: text.style,
                            text: text.text
                        }
                    })
                }
            });
        }
        return ret;
    });
};

export const renderMusicForStaff = (staffContents) => {
    let currentKeySig = null;
    let currentTimeSig = null;
    const ret = staffContents.map((measure) => {
        const voices = measure.voice;
        return voices.map((voice) => {
            let ret = "";
            if (voice.KeySig) {
                currentKeySig = voice.KeySig[0];
                ret += renderKeySig(currentKeySig) + "\n";
            }
            if (voice.TimeSig) {
                currentTimeSig = voice.TimeSig[0];
                ret += "  " + parseTimeSig(currentTimeSig) + "\n";
            }
            if (voice.Rest) {
                voice.Rest.forEach((rest) => {
                    ret += " " + parseRest(rest, currentTimeSig);
                });
            }
            if (voice.Chord) {
                voice.Chord.forEach((chord) => {
                    ret += " " + parseChord(chord, currentTimeSig, currentKeySig);
                });
            }
            return ret;
        });
    });
    return ret;
}

const renderStaff = (staff) => {
    const ret = {
        id: staff.id,
        defaultClef: staff.defaultClef[0],
        isStaffVisible: staff.isStaffVisible? staff.isStaffVisible[0] : null,
        measures: renderMusicForStaff(staff.contents)
    };
    return ret;
}

const renderPart = (part, data) => {
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
                data.musicData[key] = part.musicData[key];
            });
            Object.keys(part.partData).forEach((key) => {
                data.partData[key] = part.partData[key];
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
        if (metaInfo.worktitle) {
            parts += `    title = "${metaInfo.worktitle}"\n`;
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
        parts += `  \\score {\n ${data.partData[key]}\n  }\n`;
        parts += "}\n";
    });

    let score = "\\book {\n";
    if (options.scorePaperSize) {
        score += ` \\paper {\n   #(set-paper-size "${options.scorePaperSize}")\n }\n`;
    }
    score += "  \\score { <<\n";
    data.scoreData.forEach((part) => {
        score += part;
    });
    score += "  >>}\n";
    score += "}\n";

    return {
        music,
        parts,
        score
    }
}

/**
 * 
 * @param {MSCData} MSCData MuseScore XML data converted to JS
 * @returns 
 */
export const convertMSCX2LY = (MSCData, options = {}) => {
    // step 1: Order
    // this is a list of instruments used, and adds the family attribute to the instruments
    // it also describes the sections of the score by family
    const orderInfo = readOrderInfo(MSCData.museScore.Score[0].Order[0]);
    // step 2: Staff
    const staffInfo = readStaffInfo(MSCData.museScore.Score[0].Staff);
    // step 3: the parts
    const partsInfo = readPartsInfo(MSCData.museScore.Score[0].Part, orderInfo, staffInfo);
    // step 4: the meta info
    const metaInfo = parseMetaTag(MSCData.museScore.Score[0].metaTag);
    // with the parts info we have the parts in the order they are in the score
    // now we can start generating the lilypond structure
    // we will go throught the parts, section by section, and generate the lilypond structure and data
    const lilypondData = renderLilypond(partsInfo, metaInfo, options);
    return lilypondData;
}