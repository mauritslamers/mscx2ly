// convert jsdoc definitions to typescript

/** 
 * @typedef {Object} InstrumentFamily
 * @property {object} $
 * @property {string} $.id id of the instrument family, probably a constant
 * @property {string} _ value of the instrument family
 */

interface InstrumentFamily {
    $: {
        id: string;
    };
    _: string;
}

interface FlatInstrumentFamily {
    id: string;
    name: string;
}

/**
 * @typedef {Object} Instrument
 * @property {object} $
 * @property {string} $.id
 * @property {InstrumentFamily[]} family
 */

interface Instrument {
    $: {
        id: string;
    };
    family: InstrumentFamily[];
}

interface FlatInstrument {
    id: string;
    family: FlatInstrumentFamily[];
}

/**
 * @typedef {object} SectionUnsorted
 * @property {object} $
 * @property {string} $.group
 */

interface SectionUnsorted {
    $: {
        group: string;
    };
}

interface FlatSectionUnsorted {
    group: string;
}

/**
 * @typedef {Object} Section
 * @property {object} $
 * @property {string} $.id
 * @property {string} $.brackets brackets for the section, true or false
 * @property {string} $.barLineSpan bar line span for the section, true or false
 * @property {string} $.thinBrackets thin brackets for the section, true or false
 * @property {string[]} family list of families in the section
 * @property {object[]} unsorted list of unsorted instruments in the section
 */

interface Section {
    $: {
        id: string;
        brackets: string;
        barLineSpan: string;
        thinBrackets: string;
    };
    family: string[];
    unsorted: SectionUnsorted[];
}

interface FlatSection {
    id: string;
    brackets: boolean;
    barLineSpan: boolean;
    thinBrackets: boolean;
    family: string[];
    unsorted: FlatSectionUnsorted[];
}

/**
 * @typedef {Object} Order
 * @property {object} $
 * @property {string} $.id
 * @property {string[]} name
 * @property {Instrument[]} instrument
 * @property {Section[]} section
 * @property {string[]} family
 * @property {string[]} unsorted
 * @property {string[]} soloists
 */

interface Order {
    $: {
        id: string;
    };
    name: string[];
    instrument: Instrument[];
    section: Section[];
    family: string[];
    unsorted: string[];
    soloists: string[];
}

interface OrderInfo {
    instruments: FlatInstrument[];
    sections: FlatSection[];
}

/**
 * @typedef {String=
*  'arranger',
*  'audioComUrl',
*  'composer',
*  'copyright',
* 'creationDate',
*  'lyricist',
* 'movementNumber',
* 'movementTitle',
* 'platform',
* 'source',
* 'sourceRevisionId',
* 'subtitle',
* 'translator',
* 'workNumber',
* 'workTitle',
* } MetaTagName
*/

type MetaTagName =
    'arranger' |
    'audioComUrl' |
    'composer' |
    'copyright' |
    'creationDate' |
    'lyricist' |
    'movementNumber' |
    'movementTitle' |
    'platform' |
    'source' |
    'sourceRevisionId' |
    'subtitle' |
    'translator' |
    'workNumber' |
    'workTitle';
    
/**
* @typedef {object} StaffInstrumentChannelProgram
* @property {object} $
* @property {string} $.value
*/

interface StaffInstrumentChannelProgram {
    $: {
        value: string;
    };
}

/**
* @typedef {Object} StaffInstrumentChannel
* @property {StaffInstrumentChannelProgram[]}
* @property {string[]} synti
* @property {string[]} midiPort
* @property {string[]} midiChannel
*/

interface StaffInstrumentChannel {
    program: StaffInstrumentChannelProgram[];
    synti: string[];
    midiPort: string[];
    midiChannel: string[];
}

/**
* @typedef {Object} StaffInstrument
* @property {object} $
* @property {string} $.id
* @property {string[]} longName
* @property {string[]} shortName
* @property {string[]} trackName
* @property {string[]} minPitchP
* @property {string[]} maxPitchP
* @property {string[]} minPitchA
* @property {string[]} maxPitchA
* @property {string[]} instrumentId
* @property {string[]} clef
* @property {StaffInstrumentChannel[]} Channel
*/

interface StaffInstrument {
    $: {
        id: string;
    };
    longName: string[];
    shortName: string[];
    trackName: string[];
    minPitchP: string[];
    maxPitchP: string[];
    minPitchA: string[];
    maxPitchA: string[];
    instrumentId: string[];
    clef: string[];
    Channel: StaffInstrumentChannel[];
}

/**
* @typedef {Object} StaffType
* @property {object} $
* @property {string} $.group probably name pitched or non-pitched
* @property {string} name name of the staff type
*/

interface StaffType {
    $: {
        group: string;
        name: string;
    };
}

/**
* @typedef {Object} StaffBracket
* @property {object} $
* @property {string} $.type type of bracket
* @property {string} $.span span of the bracket
* @property {string} $.col col? of the bracket
* @property {string} $.visible whether visible
*/

interface StaffBracket {
    $: {
        type: string;
        span: string;
        col: string;
        visible: string;
    };
}

/**
* @typedef {Object} PartStaff
* @property {object} $
* @property {string} $.id
* @property {StaffType[]} StaffType
* @property {string[]} isStaffVisible looks 0 or 1, to indicate which staff is visible, all if not present
* @property {string[]} barLineSpan looks 0 or 1, 
* @property {string[]} defaultClef G clef normally if not present, "F" or perhaps "C" in other cases
*/

interface PartStaff {
    $: {
        id: string;
    };
    StaffType: StaffType[];
    isStaffVisible: string[];
    barLineSpan: string[];
    defaultClef: string[];
}

/**
* @typedef {Object} Part
* @property {object} $
* @property {string} $.id
* @property {PartStaff[]} Staff
* @property {string[]} trackName
* @property {StaffInstrument[]} Instrument
*/

interface Part {
    $: {
        id: string;
    };
    Staff: PartStaff[];
    trackName: string[];
    Instrument: StaffInstrument[];
}

/**
* @typedef {Object} VBoxText
* @property {string[]} eid
* @property {string[]} linkedMain
* @property {string[]} style
* @property {string[]} text
*/

interface VBoxText {
    eid: string[];
    linkedMain: string[];
    style: string[];
    text: string[];
}

/**
* @typedef {Object} VBox
* @property {string[]} height
* @property {string[]} eid
* @property {string[]} linkedMain
* @property {VBoxText[]} Text
*/

interface VBox {
    height: string[];
    eid: string[];
    linkedMain: string[];
    Text: VBoxText[];
}


/**
* @typedef {Object} KeySig
* @property {string[]} eid
* @property {string[]} concertKey 0 for C, 1 for G, -1 for F etc...
*/

interface KeySig {
    eid: string[];
    concertKey: string[];
}

/**
* @typedef {Object} TimeSig
* @property {string[]} eid
* @property {string[]} sigN
* @property {string[]} sigD
*/

interface TimeSig {
    eid: string[];
    sigN: string[];
    sigD: string[];
}

/**
* @typedef {Object} Tempo
* @property {string[]} tempo
* @property {string[]} followText
* @property {string[]} eid
* @property {string[]} linkedMain
* @property {object[]} text
* @property {string} text._ tempo text
* @property {string[]} text.sym tempo symbol
* @property {object[]} text.font
* @property {object} text.font.$
* @property {string} text.font.$.face
*/

interface Tempo {
    tempo: string[];
    followText: string[];
    eid: string[];
    linkedMain: string[];
    text: {
        _: string;
        sym: string[];
        font: {
            $: {
                face: string;
            };
        };
    }[];
}

/**
* @typedef {Object} Rest
* @property {string[]} eid
* @property {string[]} durationType
* @property {string[]} duration
*/

interface Rest {
    eid: string[];
    durationType: string[];
    duration: string[];
}

/**
* @typedef {Object} Dynamic
* @property {string[]} eid
* @property {string[]} subtype
* @property {string[]} velocity
*/

interface Dynamic {
    eid: string[];
    subtype: string[];
    velocity: string[];
}

/**
* @typedef {Object} HairPin
* @property {string[]} subtype is a number, might be a enum
* @property {string[]} eid
*/

interface HairPin {
    subtype: string[];
    eid: string[];
}

/**
* @typedef {Object} Location
* @property {string[]} measures
*/

interface Location {
    measures: string[];
}

/**
* @typedef {Object} Spanner
* @property {object} $
* @property {string} $.type type of spanner, probably the same name as the property on the main object
* @property {HairPin[]} [HairPin]
* @property {Location[]} [next]
* @property {Location[]} [prev]
*/

interface Spanner {
    $: {
        type: string;
    };
    HairPin: HairPin[];
    next: Location[];
    prev: Location[];
}

/**
* @typedef {Object} Accidental
* @property {string[]} eid
* @property {string[]} subtype // accidentalNatural
*/

interface Accidental {
    eid: string[];
    subtype: string[];
}

/**
* @typedef {Object} Note
* @property {string[]} eid
* @property {string[]} pitch
* @property {string[]} tpc No clue what this is, looks like transpose pitch class
* @property {Accidental[]} [Accidental]
*/

interface Note {
    eid: string[];
    pitch: string[];
    tpc: string[];
    Accidental: Accidental[];
}

/**
* @typedef {Object} Articulation
* @property {string[]} eid
* @property {string[]} subtype
*/

interface Articulation {
    eid: string[];
    subtype: string[];
}

/**
* @typedef {Object} Chord
* @property {string[]} eid
* @property {string[]} dots
* @property {string[]} durationType
* @property {Note[]} [Note]
* @property {Articulation[]} [Articulation]
*/

interface Chord {
    eid: string[];
    dots: string[];
    durationType: string[];
    Note: Note[];
    Articulation: Articulation[];
}

/**
* @typedef {Object} MeasureVoice
* @property {KeySig[]} [KeySig]
* @property {TimeSig[]} [TimeSig]
* @property {Tempo[]} [Tempo]
* @property {Rest[]} [Rest]
* @property {Dynamic[]} [Dynamic]
* @property {Spanner[]} [Spanner]
* @property {Chord[]} [Chord]
*/

interface MeasureVoice {
    KeySig: KeySig[];
    TimeSig: TimeSig[];
    Tempo: Tempo[];
    Rest: Rest[];
    Dynamic: Dynamic[];
    Spanner: Spanner[];
    Chord: Chord[];
}

/**
* @typedef {Object} StaffMeasure
* @property {MeasureVoice[]} voice
*/

interface StaffMeasure {
    voice: MeasureVoice[];
}

/**
* @typedef {Object} ScoreStaff
* @property {object} $
* @property {string} $.id
* @property {VBox[]} VBox
* @property {StaffMeasure[]} Measure
*/

interface ScoreStaff {
    $: {
        id: string;
    };
    VBox: VBox[];
    Measure: StaffMeasure[];
}

/**
* @typedef {Object} MetaTag
* @property {object} $
* @property {MetaTagName} $.name
* @property {string} _ value of the metaTag
*/

interface FlatScoreStaff {
    id: string;
    Measure: StaffMeasure[];
}

interface MetaTag {
    $: {
        name: MetaTagName;
    };
    _: string;
}

interface FlatMetaTag {
    [key: MetaTagName]: string;
}

/**
* @typedef {Object} Score
* @property {string[]} layoutMode
* @property {string[]} Division
* @property {string[]} showInvisible
* @property {string[]} showUnprintable
* @property {string[]} showFrames
* @property {string[]} showMargins
* @property {string[]} open
* @property {MetaTag[]} metaTag
* @property {Order[]} Order
* @property {Part[]} Part
* @property {ScoreStaff[]} Staff
*/

interface Score {
    layoutMode: string[];
    Division: string[];
    showInvisible: string[];
    showUnprintable: string[];
    showFrames: string[];
    showMargins: string[];
    open: string[];
    metaTag: MetaTag[];
    Order: Order[];
    Part: Part[];
    Staff: ScoreStaff[];
}


/**
* @typedef {Object} MuseScore
* @property {object} $
* @property {string[]} $.version
* @property {string[]} programVersion
* @property {string[]} programRevision
* @property {string[]} LastEID
* @property {Score} Score
*/

interface MuseScore {
    $: {
        version: string;
    };
    programVersion: string[];
    programRevision: string[];
    LastEID: string[];
    Score: Score;
}

/**
* @typedef {Object} MSCData
* @property {MuseScore} museScore
*/

interface MSCData {
    museScore: MuseScore;
}

interface LilypondData {
    music: string; // the instrumental parts as macros / variables
    parts: string; // the parts as a list of books
    score: string; // the main partiture as a book
}

class XmlWrapper {
    get children(): XmlWrapper | XmlWrapper[]; // the children of the current node
    get attributes(): { [key: string]: string }; // the attributes of the current node  
    get text(): string; // the text of the current node
    get name(): string; // the name of the current node
    get hasAttributes(): boolean; // whether the current node has attributes
    get hasChildren(): boolean; // whether the current node has children
    get isText(): boolean; // whether the current node is a text node
    parent: XmlWrapper; // the parent of the current node
    data: object; // the data of the current node
    constructor(data: object, parent: XmlWrapper);
    get (name: string): XmlWrapper; // get children by name
    get keys(): { [key:string]: any }; // get the keys of the current node
}