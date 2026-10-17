import test from 'ava';
import { existsSync, readFileSync } from 'fs';
import admZip from 'adm-zip';
import xml2js from 'xml2js';
import { XmlWrapper } from './xml_wrapper.js';
import { convertMSCX2LY, createValidPartName, createPartNamer, lilypondKeywords, musicIdentifiers, renderLyricTimings, renderBarLine, readOrderInfo, readStaffInfo, readPartsInfo, getEventHandlers, parseRest, renderRehearsalMark, renderTempo, renderStaffOpen } from './lib.js';
import { findVoltaStart, analyzeRepeats, mergeRepeatMarkers, applyRepeats } from './render/repeats.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Real MuseScore fixtures are gitignored (many are copyrighted songs/
// arrangements, see tests/reference_results/readme.md) and only exist on
// machines that were given them locally. Skip rather than fail when a fixture
// is missing, so `npm test` stays green on a fresh clone/CI.
const hasFixture = (name) => existsSync(`tests/${name}`);
const maybeTest = (name, title, impl) => (hasFixture(name) ? test : test.skip)(title, impl);

const xmlParser = new xml2js.Parser({ preserveChildrenOrder: true, explicitChildren: true, charsAsChildren: true });

const loadFile = (sourceFile) => {
    let source;
    try {
        const zip = new admZip(sourceFile);
        const entry = zip.getEntries().find(e => e.entryName.endsWith('.mscx'));
        source = zip.readAsText(entry);
    } catch {
        source = readFileSync(sourceFile, 'utf8');
    }
    return source;
};

const convertFile = async (sourceFile, options = {}) => {
    const json = await xmlParser.parseStringPromise(loadFile(sourceFile));
    const data = new XmlWrapper(json.museScore);
    return convertMSCX2LY(data, options);
};

// stub satisfying the tiny bit of the XmlWrapper interface renderBarLine needs
const barLineNode = (subtype, spanFromOffset, spanToOffset) => ({
    get: (name) => ({ subtype, spanFromOffset, spanToOffset })[name] ?? null,
});

// stub satisfying the tiny bit of the XmlWrapper interface parseRest needs
const restNode = (duration, durationType, dots) => ({
    get: (name) => ({ duration, durationType, dots })[name] ?? null,
});

test('parseRest: a 3/2 whole-measure rest renders as R1*3/2, not a quarter rest', t => {
    t.is(parseRest(restNode('3/2', 'measure')), 'R1*3/2');
});

test('parseRest: a 6/4 whole-measure rest renders as R1*6/4', t => {
    t.is(parseRest(restNode('6/4', 'measure')), 'R1*6/4');
});

test('parseRest: a plain 4/4 whole-measure rest still renders as R1 (regression guard)', t => {
    t.is(parseRest(restNode('4/4', 'measure')), 'R1');
});

test('parseRest: a plain quarter rest still renders as r4 (regression guard)', t => {
    t.is(parseRest(restNode('1/4', null)), 'r4');
});

test('parseRest: a dotted half rest (durationType + dots, no duration fraction) renders as r2., not r2', t => {
    // Ground truth: tests/asa-branca-flauta-e-violino.mscz's flauta part
    // opens with <Rest><dots>1</dots><durationType>half</durationType></Rest>
    // — no <duration> fraction, so durationMap alone can't see the dot.
    t.is(parseRest(restNode(null, 'half', '1')), 'r2.');
});

test('parseRest: a plain half rest with no dots is unaffected (regression guard)', t => {
    t.is(parseRest(restNode(null, 'half')), 'r2');
});

// ---------------------------------------------------------------------------
// Bar line types
// renderBarLine is exercised directly (no fixture needed) so every subtype is
// pinned to its LilyPond symbol regardless of golden-file/fixture drift.
// ---------------------------------------------------------------------------

const barLineCases = [
    ['final', '\\bar "|."'],
    ['end', '\\bar "|."'],
    ['double', '\\bar "||"'],
    ['dashed', '\\bar "!"'],
    ['dotted', '\\bar ";"'],
    ['reverse-end', '\\bar ".|"'],
    ['heavy', '\\bar "x-."'],
    ['double-heavy', '\\bar ".."'],
];
for (const [subtype, expected] of barLineCases) {
    test(`renderBarLine: "${subtype}" -> ${expected}`, t => {
        t.is(renderBarLine(barLineNode(subtype)), expected);
    });
}

test('renderBarLine: gregorian barlines are resolved from span offsets', t => {
    t.is(renderBarLine(barLineNode(null, '-1', '-7')), '\\bar "\'"');
    t.is(renderBarLine(barLineNode(null, '-2', '-2')), '\\bar ","');
});

test('renderBarLine: divisio minima (positive-offset variant, e.g. all_barlines.mscz bar 14) also renders as a comma', t => {
    t.is(renderBarLine(barLineNode(null, '2', '-2')), '\\bar ","');
});

test('renderBarLine: divisio maior (e.g. all_barlines.mscz bar 15) also renders as a comma', t => {
    t.is(renderBarLine(barLineNode(null, '1', '-1')), '\\bar ","');
});

test('renderBarLine: unknown subtype renders nothing rather than throwing', t => {
    t.is(renderBarLine(barLineNode('not-a-real-subtype')), '');
});

// ---------------------------------------------------------------------------
// Version-gated event handler registry
// getEventHandlers(formatVersion) is the seam for a future per-version voice-
// event override (modeled on MuseScore's RWRegister::reader). No real event
// differs by version yet, so this pins the dispatch mechanism itself: same
// handler table object for every version today, but a genuine function of
// its argument, not a value that ignores it.
// ---------------------------------------------------------------------------

test('getEventHandlers: returns the same table for any format version today', t => {
    const oldHandlers = getEventHandlers(114);
    const newHandlers = getEventHandlers(500);
    t.is(oldHandlers, newHandlers);
    t.is(typeof oldHandlers.Chord, 'function');
    t.is(typeof oldHandlers.BarLine, 'function');
});

// ---------------------------------------------------------------------------
// Multiple voices
// ---------------------------------------------------------------------------

maybeTest('enrose.mscz', 'enrose: measures with two voices render as << { } \\\\ { } >>', async t => {
    const result = await convertFile('tests/enrose.mscz');
    t.true(result.music.includes('} \\\\ { '));
});

// ---------------------------------------------------------------------------
// Dynamics positioning
// Dynamics must attach directly to the note/rest they belong to (no space),
// the way MuseScore attaches them to a specific chord/rest, not float free.
// ---------------------------------------------------------------------------

maybeTest('marijn.mscz', 'marijn: dynamics attach directly to their note with no separating space', async t => {
    const result = await convertFile('tests/marijn.mscz');
    const attached = result.music.match(/[a-grs][',]*\d+\.*\\(pp|p|mp|mf|f|ff|fff|sf|sfz|fp)\b/g) || [];
    t.true(attached.length > 100, `expected many attached dynamics, found ${attached.length}`);
});

// ---------------------------------------------------------------------------
// PianoStaff / staff groups
// ---------------------------------------------------------------------------

maybeTest('enrose.mscz', 'enrose: a two-staff piano part renders as \\new PianoStaff with treble+bass clefs', async t => {
    const result = await convertFile('tests/enrose.mscz');
    t.true(result.score.includes('\\new PianoStaff <<'));
    t.true(result.score.includes('\\clef treble'));
    t.true(result.score.includes('\\clef bass'));
});

maybeTest('carol_of_the_bells.mscz', 'carol_of_the_bells: piano accompaniment also renders as \\new PianoStaff', async t => {
    const result = await convertFile('tests/carol_of_the_bells.mscz');
    t.true(result.score.includes('\\new PianoStaff <<'));
});

// ---------------------------------------------------------------------------
// Version matrix
// Every fixture we have, spanning MuseScore 3.01 through 4.70. Each must
// convert without throwing AND produce non-trivial music output — this is
// the check that would have caught a real bug found while writing this
// suite: newer (4.6+) files identify <Part><Staff> with <eid> while
// <Score><Staff id="N"> keeps sequential ids, so id-equality matching quietly
// produced an empty staff for every single part.
// ---------------------------------------------------------------------------

const versionMatrix = [
    ['all_barlines.mscz', 300],
    ['and_i_love_her_kh.mscz', 1200],
    ['articulations.mscz', 400],
    ['asa-branca-flauta-e-violino.mscz', 700],
    ['Ay_mama.mscz', 400],
    ['calmes_for_lyrics.mscz', 3500],
    ['carol_of_the_bells.mscz', 20000],
    ['enrose.mscz', 1000],
    ['fermatas_breathes_caesuras.mscz', 500],
    ['Hairpins.mscz', 250],
    ['marijn.mscz', 18000],
    ['sto_te_nema.mscz', 5000],
    ['tchaikovski_symp5_finale_mscore_4.7.mscz', 60000],
    ['test.mscz', 10000],
    ['calmes_for_lyrics.mscx', 3500],
    ['score.mscx', 1200],
    ['SimpleGifts.mscx', 2000],
];
for (const [name, minLength] of versionMatrix) {
    maybeTest(name, `version matrix: ${name} converts to non-trivial music output`, async t => {
        const result = await convertFile(`tests/${name}`);
        t.true(result.music.length >= minLength,
            `expected at least ${minLength} chars of music, got ${result.music.length}`);
    });
}

maybeTest('asa-branca-flauta-e-violino.mscz', 'asa-branca-flauta-e-violino: flauta\'s opening dotted half rest renders as r2., not r2', async t => {
    const result = await convertFile('tests/asa-branca-flauta-e-violino.mscz');
    t.true(result.music.includes('r2.'), 'expected a dotted half rest (r2.) in the flauta part');
});

// ---------------------------------------------------------------------------
// Rehearsal marks
// ---------------------------------------------------------------------------

// stub satisfying the tiny bit of the XmlWrapper interface renderRehearsalMark needs
const rehearsalMarkNode = (text) => ({
    get: (name) => ({ text })[name] ?? null,
});

test('renderRehearsalMark: renders as a boxed \\mark, matching MuseScore\'s default rehearsal-mark style', t => {
    t.is(renderRehearsalMark(rehearsalMarkNode('A')), '\\mark \\markup { \\box "A" }');
});

maybeTest('asa-branca-flauta-e-violino.mscz', 'asa-branca-flauta-e-violino: rehearsal marks A, B, and C all appear in the flauta part', async t => {
    const result = await convertFile('tests/asa-branca-flauta-e-violino.mscz');
    t.true(result.music.includes('\\mark \\markup { \\box "A" }'));
    t.true(result.music.includes('\\mark \\markup { \\box "B" }'));
    t.true(result.music.includes('\\mark \\markup { \\box "C" }'));
});

// ---------------------------------------------------------------------------
// Tempo markings
// ---------------------------------------------------------------------------

test('renderTempo: a metronome mark with symbol + value renders as \\tempo 4 = 80', t => {
    t.is(renderTempo({ tempoSymbolValue: 4, tempoValue: 80 }), '\\tempo 4 = 80');
});

test('renderTempo: free text (e.g. "A Tempo", no metronome mark) renders as \\tempo "..."', t => {
    t.is(renderTempo({ tempoText: 'A Tempo' }), '\\tempo "A Tempo"');
});

test('renderTempo: no usable data renders nothing', t => {
    t.is(renderTempo({}), '');
});

const tempoMixedContentXml = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.40">
  <programVersion>4.4.3</programVersion>
  <Score>
    <metaTag name="workTitle">Synthetic</metaTag>
    <metaTag name="movementTitle">Synthetic Movement</metaTag>
    <Staff id="1">
      <Measure>
        <voice>
          <Tempo>
            <tempo>1.33333</tempo>
            <followText>1</followText>
            <text><sym>metNoteQuarterUp</sym><font face="FreeSerif"/> = 80</text>
          </Tempo>
          <Rest><durationType>quarter</durationType></Rest>
        </voice>
      </Measure>
    </Staff>
    <Part>
      <Staff id="1"><StaffType><name>stdNormal</name></StaffType></Staff>
      <trackName>Solo</trackName>
      <Instrument><longName>Solo</longName><shortName>Sl</shortName><instrumentId>test.solo</instrumentId><Channel><synti>Fluid</synti></Channel></Instrument>
    </Part>
  </Score>
</museScore>`;

test('parseTempo: a mixed-content <text> (metronome symbol + trailing "= 80") is not collapsed to just its trailing text', async t => {
    // Ground truth: tests/asa-branca-flauta-e-violino.mscz's opening tempo mark
    // has this exact shape. XmlWrapper's isText shortcut used to fire on any
    // direct text, even alongside <sym>/<font> children, silently discarding
    // the metronome symbol and producing "\tempo \" = 80\"" instead.
    const result = await convertSynthetic(tempoMixedContentXml);
    t.true(result.music.includes('\\tempo 4 = 80'), `expected "\\tempo 4 = 80" in ${result.music}`);
});

maybeTest('asa-branca-flauta-e-violino.mscz', 'asa-branca-flauta-e-violino: opening tempo mark renders as \\tempo 4 = 80', async t => {
    const result = await convertFile('tests/asa-branca-flauta-e-violino.mscz');
    t.true(result.music.includes('\\tempo 4 = 80'));
});

// ---------------------------------------------------------------------------
// Staff line count
// ---------------------------------------------------------------------------

test('renderStaffOpen: the default 5-line staff (lineCount null, or explicitly 5) needs no override', t => {
    t.is(renderStaffOpen(null), '\\new Staff {\n');
    t.is(renderStaffOpen(5), '\\new Staff {\n');
});

test('renderStaffOpen: a non-default line count (e.g. a single-line percussion staff) overrides StaffSymbol.line-count', t => {
    t.is(renderStaffOpen(1), '\\new Staff \\with {\n    \\override StaffSymbol.line-count = #1\n} {\n');
});

maybeTest('tchaikovski_symp5_finale_mscore_4.7.mscz', 'tchaikovski: single-line percussion staves (bass drum, cymbals) override line-count, snare drum (5 lines) does not', async t => {
    const result = await convertFile('tests/tchaikovski_symp5_finale_mscore_4.7.mscz');
    const overrides = (result.score.match(/\\override StaffSymbol\.line-count = #1/g) || []).length;
    // one override per single-line staff in the *score* block (bass drum, cymbals)
    t.true(overrides >= 2, `expected at least 2 line-count overrides in the score, found ${overrides}`);
});

// ---------------------------------------------------------------------------
// Staff groupings (StaffGroup brackets)
// readPartsInfo used to try deriving section membership from instrument-
// family heuristics that never actually worked (see readOrderInfo below),
// so every part rendered ungrouped. It now reads MuseScore's own
// already-computed <bracket col="0"> spans directly instead.
// ---------------------------------------------------------------------------

maybeTest('tchaikovski_symp5_finale_mscore_4.7.mscz', 'tchaikovski: woodwind, brass, percussion, and strings each render as their own \\new StaffGroup', async t => {
    const result = await convertFile('tests/tchaikovski_symp5_finale_mscore_4.7.mscz');
    const groupCount = (result.score.match(/\\new StaffGroup <</g) || []).length;
    t.is(groupCount, 4, `expected 4 StaffGroups (woodwind, brass, percussion, strings), found ${groupCount}`);
});

maybeTest('tchaikovski_symp5_finale_mscore_4.7.mscz', 'tchaikovski: timpani (no bracket, standalone) is not wrapped in a StaffGroup', async t => {
    const result = await convertFile('tests/tchaikovski_symp5_finale_mscore_4.7.mscz');
    // Pauken (timpani) sits between the brass and percussion StaffGroups; its
    // own \new Staff must not be nested inside either one.
    const between = result.score.split('\\new StaffGroup <<')[2].split('>>')[0];
    t.false(between.includes('Pauken'), 'timpani should not be inside the brass StaffGroup');
});

test('readPartsInfo: a part whose own multi-staff brace (type=1, e.g. piano) is not mistaken for a cross-part section', async t => {
    // Ground truth: tests/enrose.mscz's piano part has exactly this
    // <bracket type="1" span="2" col="0"/> on its own first staff — it must
    // stay a single PianoStaff part, not get wrapped in an extra StaffGroup.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.40">
  <programVersion>4.4.3</programVersion>
  <Score>
    <metaTag name="workTitle">Synthetic</metaTag>
    <metaTag name="movementTitle">Synthetic Movement</metaTag>
    <Staff id="1"><Measure><voice><Rest><durationType>quarter</durationType></Rest></voice></Measure></Staff>
    <Staff id="2"><Measure><voice><Rest><durationType>quarter</durationType></Rest></voice></Measure></Staff>
    <Part>
      <Staff><bracket type="1" span="2" col="0" visible="1"/><StaffType><name>stdNormal</name></StaffType></Staff>
      <Staff><StaffType><name>stdNormal</name></StaffType></Staff>
      <trackName>Piano</trackName>
      <Instrument><longName>Piano</longName><shortName>Pno.</shortName><instrumentId>keyboard.piano</instrumentId><Channel><synti>Fluid</synti></Channel></Instrument>
    </Part>
  </Score>
</museScore>`;
    const json = await xmlParser.parseStringPromise(xml);
    const data = new XmlWrapper(json.museScore);
    const Score = data.get('Score');
    const orderInfo = readOrderInfo(Score.get('Order'));
    const staffInfo = readStaffInfo(Score.get('Staff'));
    const partsInfo = readPartsInfo(Score.get('Part'), orderInfo, staffInfo);
    t.is(partsInfo.length, 1);
    t.falsy(partsInfo[0].isSection, 'a single piano part should not become a section');
    t.is(partsInfo[0].staffs.length, 2);
});

// ---------------------------------------------------------------------------
// Staff matching by document position
// <Score><Staff id="N"> numbers staves by position in every MuseScore format
// era; it is not a key shared with <Part><Staff>'s own id/eid. These synthetic
// scores stand in for two real shapes we can't easily get real fixtures for:
// pre-3.0 files (no id/eid at all on <Part><Staff>) and 4.6+ files (<eid> on
// <Part><Staff> unrelated to the score-level id numbering).
// ---------------------------------------------------------------------------

const twoStaffScore = (partStaffTag) => `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="2.06">
  <programVersion>2.0.3</programVersion>
  <Score>
    <metaTag name="workTitle">Synthetic</metaTag>
    <metaTag name="movementTitle">Synthetic Movement</metaTag>
    <Staff id="1"><Measure><voice><Rest><durationType>quarter</durationType></Rest></voice></Measure></Staff>
    <Staff id="2"><Measure><voice><Rest><durationType>half</durationType></Rest></voice></Measure></Staff>
    <Part>
      <Staff>${partStaffTag(1)}<StaffType><name>stdNormal</name></StaffType></Staff>
      <trackName>First</trackName>
      <Instrument><longName>First</longName><shortName>Fst</shortName><instrumentId>test.first</instrumentId><Channel><synti>Fluid</synti></Channel></Instrument>
    </Part>
    <Part>
      <Staff>${partStaffTag(2)}<StaffType><name>stdNormal</name></StaffType></Staff>
      <trackName>Second</trackName>
      <Instrument><longName>Second</longName><shortName>Snd</shortName><instrumentId>test.second</instrumentId><Channel><synti>Fluid</synti></Channel></Instrument>
    </Part>
  </Score>
</museScore>`;

const convertSynthetic = async (xml) => {
    const json = await xmlParser.parseStringPromise(xml);
    const data = new XmlWrapper(json.museScore);
    return convertMSCX2LY(data, {});
};

test('staff matching: parts without any id/eid (pre-3.0 shape) still get the right content by position', async t => {
    const result = await convertSynthetic(twoStaffScore(() => ''));
    t.true(result.music.includes('r4'), 'first part should get the quarter rest');
    t.true(result.music.includes('r2'), 'second part should get the half rest');
});

test('staff matching: <eid> unrelated to score-level id (4.6+ shape) still gets the right content by position', async t => {
    const result = await convertSynthetic(twoStaffScore((n) => `<eid>${n === 1 ? 'aRandomEid123' : 'zAnotherEid789'}</eid>`));
    t.true(result.music.includes('r4'), 'first part should get the quarter rest');
    t.true(result.music.includes('r2'), 'second part should get the half rest');
});

test('readPartsInfo: staff offsets advance per part regardless of id scheme', async t => {
    const xml = twoStaffScore((n) => `<eid>irrelevant-${n}</eid>`);
    const json = await xmlParser.parseStringPromise(xml);
    const data = new XmlWrapper(json.museScore);
    const Score = data.get('Score');
    const orderInfo = readOrderInfo(Score.get('Order'));
    const staffInfo = readStaffInfo(Score.get('Staff'));
    const partsInfo = readPartsInfo(Score.get('Part'), orderInfo, staffInfo);
    t.is(partsInfo[0].staffs[0].contents[0].voice[0][0].get('durationType'), 'quarter');
    t.is(partsInfo[1].staffs[0].contents[0].voice[0][0].get('durationType'), 'half');
});

// ---------------------------------------------------------------------------
// Tuplet annotation
// ---------------------------------------------------------------------------

const tupletXml = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="2.06">
  <programVersion>2.0.3</programVersion>
  <Score>
    <metaTag name="workTitle">Synthetic</metaTag>
    <metaTag name="movementTitle">Synthetic Movement</metaTag>
    <Staff id="1">
      <Measure>
        <voice>
          <Tuplet actualNotes="3" normalNotes="2"/>
          <Chord><durationType>eighth</durationType><Note><pitch>60</pitch><tpc>0</tpc></Note></Chord>
          <Chord><durationType>eighth</durationType><Note><pitch>62</pitch><tpc>1</tpc></Note></Chord>
          <Chord><durationType>eighth</durationType><Note><pitch>64</pitch><tpc>2</tpc></Note></Chord>
          <endTuplet/>
          <Rest><durationType>quarter</durationType></Rest>
        </voice>
      </Measure>
    </Staff>
    <Part>
      <Staff id="1"><StaffType><name>stdNormal</name></StaffType></Staff>
      <trackName>Solo</trackName>
      <Instrument><longName>Solo</longName><shortName>Sl</shortName><instrumentId>test.solo</instrumentId><Channel><synti>Fluid</synti></Channel></Instrument>
    </Part>
  </Score>
</museScore>`;

test('tuplets: a 3/2 tuplet wraps the notes in \\tuplet 3/2 { }', async t => {
    const result = await convertSynthetic(tupletXml);
    t.true(result.music.includes('\\tuplet 3/2'), 'tuplet marker should appear in output');
});

// ---------------------------------------------------------------------------
// Repeats and volta (1st/2nd/... ending) brackets
// See tickets/B01-repeat-barlines-not-converted.md for the investigation
// this is based on, and render/repeats.js for the ground truth this pins.
// ---------------------------------------------------------------------------

const marker = (overrides) => ({ startRepeat: false, endRepeat: null, voltaStart: null, ...overrides });

test('analyzeRepeats: a plain repeat (no voltas) becomes one region spanning its measures', t => {
    const markers = [marker({}), marker({ endRepeat: '2' }), marker({})];
    const regions = analyzeRepeats(markers);
    t.deepEqual(regions, [{ startIndex: 0, bodyEndIndex: 1, count: 2, endings: null }]);
});

test('analyzeRepeats: an explicit startRepeat anchors the body instead of measure 0', t => {
    const markers = [marker({}), marker({ startRepeat: true }), marker({}), marker({ endRepeat: '2' })];
    const regions = analyzeRepeats(markers);
    t.is(regions[0].startIndex, 1);
    t.is(regions[0].bodyEndIndex, 3);
});

test('analyzeRepeats: a 2-ending volta group takes its count from the last ending, not endRepeat\'s own value', t => {
    // Ground truth from tests/repeats.mscz: MuseScore tags endRepeat on every
    // ending except the last, and its value ("2") is not reliable as the
    // count once voltas are involved — see render/repeats.js.
    const markers = [
        marker({}),
        marker({ endRepeat: '2', voltaStart: { endings: 1, span: 1 } }),
        marker({ voltaStart: { endings: 2, span: 1 } }),
    ];
    const regions = analyzeRepeats(markers);
    t.deepEqual(regions, [{
        startIndex: 0,
        bodyEndIndex: 0,
        count: 2,
        endings: [
            { startIndex: 1, endIndex: 1, number: 1 },
            { startIndex: 2, endIndex: 2, number: 2 },
        ],
    }]);
});

test('analyzeRepeats: a 3-ending volta group is fully collected even though endRepeat also tags the 2nd (non-final) ending', t => {
    const markers = [
        marker({}),
        marker({ endRepeat: '2', voltaStart: { endings: 1, span: 1 } }),
        marker({ endRepeat: '2', voltaStart: { endings: 2, span: 1 } }),
        marker({ voltaStart: { endings: 3, span: 1 } }),
    ];
    const regions = analyzeRepeats(markers);
    t.is(regions.length, 1);
    t.is(regions[0].count, 3);
    t.deepEqual(regions[0].endings.map(e => e.number), [1, 2, 3]);
});

test('mergeRepeatMarkers: markers present on only one staff still show up in the merged result', t => {
    // Ground truth from tests/repeats.mscz: a piano grand staff's bass staff
    // carries none of these markers at all, only the treble staff does.
    const trebleMeasures = [{ startRepeat: false, endRepeat: '2', voltaStart: null }];
    const bassMeasures = [{ startRepeat: false, endRepeat: null, voltaStart: null }];
    const merged = mergeRepeatMarkers([trebleMeasures, bassMeasures]);
    t.is(merged[0].endRepeat, '2');
});

test('applyRepeats: wraps a plain repeat\'s measures in \\repeat volta N { }', t => {
    const measures = ['m1', 'm2', 'm3'];
    const regions = [{ startIndex: 0, bodyEndIndex: 1, count: 2, endings: null }];
    const out = applyRepeats(measures, regions);
    t.is(out[0], '\\repeat volta 2 {\n    m1');
    t.is(out[1], 'm2\n  }');
    t.is(out[2], 'm3');
});

test('applyRepeats: an empty (rest-only) staff still gets the same wrapping as one with real notes', t => {
    // This is the piano-left-hand case: MuseScore only stores the markers on
    // one staff, but every staff must be wrapped identically regardless of
    // its own content (tests/repeats_manualtest.ly, the manually-verified
    // reference, does this too).
    const measures = ['R1', 'R1', 'R1'];
    const regions = [{ startIndex: 0, bodyEndIndex: 1, count: 2, endings: null }];
    const out = applyRepeats(measures, regions);
    t.is(out[0], '\\repeat volta 2 {\n    R1');
    t.is(out[1], 'R1\n  }');
});

test('applyRepeats: builds a self-contained \\alternative block so the caller\'s bar-check join can\'t land inside it', t => {
    // Regression guard: an earlier version let the caller's `join(' |\\n  ')`
    // insert a stray `|` directly inside \alternative's braces, which made
    // real LilyPond silently drop every ending but the first.
    const measures = ['body1', 'body2', 'end1', 'end2'];
    const regions = [{
        startIndex: 0,
        bodyEndIndex: 1,
        count: 2,
        endings: [
            { startIndex: 2, endIndex: 2, number: 1 },
            { startIndex: 3, endIndex: 3, number: 2 },
        ],
    }];
    const out = applyRepeats(measures, regions);
    // the two ending slots are consumed into one combined element, not left
    // behind for the caller to join with a bar-check in between
    t.is(out.length, 2);
    t.is(out[1], 'body2\n  }\n  \\alternative {\n    { end1\n    }\n    { end2\n    }\n  }');
    const compiled = out.join(' |\n  ');
    t.false(compiled.includes('\\alternative { |'), 'no stray bar-check directly inside \\alternative');
});

maybeTest('repeats.mscz', 'repeats: a plain repeat and 2-ending/3-ending volta groups all wrap in \\repeat volta / \\alternative', async t => {
    const result = await convertFile('tests/repeats.mscz');
    t.true(result.music.includes('\\repeat volta 2 {'), 'plain repeat should be wrapped');
    t.true(result.music.includes('\\repeat volta 3 {'), '3-ending group should use the last ending\'s count, not endRepeat\'s own value');
    t.true(result.music.includes('\\alternative {'), 'volta endings should produce an \\alternative block');
});

maybeTest('repeats.mscz', 'repeats: the empty piano left hand gets the same \\repeat volta wrapping as the right hand', async t => {
    const result = await convertFile('tests/repeats.mscz');
    const pianoTwoMatch = result.music.match(/pianoTwo = \{([\s\S]*?)\n\}/);
    t.truthy(pianoTwoMatch, 'expected a pianoTwo music macro');
    t.true(pianoTwoMatch[1].includes('\\repeat volta 2 {'), 'empty staff should still get the repeat wrapping');
});

// ---------------------------------------------------------------------------
// Known gaps
// Documented rather than silently broken — visible in `ava --verbose` without
// failing the suite. Promote to a real test once fixed.
// ---------------------------------------------------------------------------

test.todo('renderSpanner: GradualTempoChange (and other non-HairPin spanners) are not implemented, see console warning');
test.todo('parseTempo: tempo texts built from multiple <sym> symbols (e.g. dotted-note metronome marks) are not resolved');
test.todo('handleChord: only the first lyric verse is used when a note has multiple simultaneous <Lyrics> verses');

// ---------------------------------------------------------------------------
// Voicing edge case: a voice containing only a structural event (no
// Chord/Rest). This test locks in CURRENT behavior before render/voicing.js
// (see tickets/R05) changes how "does this voice have content" is decided.
// Do not "fix" this test to match what you think is more correct — it
// exists to freeze what happens today so a later change is deliberate.
// See tickets/00-background.md and tickets/R04-*.md for why.
// ---------------------------------------------------------------------------

const keySigOnlyVoiceScore = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.40">
  <programVersion>4.4.3</programVersion>
  <Score>
    <metaTag name="workTitle">Synthetic</metaTag>
    <metaTag name="movementTitle">Synthetic Movement</metaTag>
    <Staff id="1"><Measure><voice><KeySig><concertKey>0</concertKey></KeySig></voice></Measure></Staff>
    <Part>
      <Staff id="1"><StaffType><name>stdNormal</name></StaffType></Staff>
      <trackName>Solo</trackName>
      <Instrument><longName>Solo</longName><shortName>Sl</shortName><instrumentId>test.solo</instrumentId><Channel><synti>Fluid</synti></Channel></Instrument>
    </Part>
  </Score>
</museScore>`;

test('voicing edge case: a voice with only a KeySig (no Chord/Rest) — current behavior', async t => {
    const result = await convertSynthetic(keySigOnlyVoiceScore);
    // updated by R05: empty-voicing branch now runs for this case
    t.is(result.music.trim(), 'solo = { \n  \\key c \\major s1 \\bar "|."\n}');
});

// ---------------------------------------------------------------------------
// PR #9 review follow-ups
// ---------------------------------------------------------------------------

const syntheticScore = (staffBody, parts = [['Solo', 1]]) => `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.40">
  <programVersion>4.4.3</programVersion>
  <Score>
    <metaTag name="workTitle">Synthetic</metaTag>
    <metaTag name="movementTitle">Synthetic Movement</metaTag>
    ${parts.map(([, id]) => `<Staff id="${id}">${staffBody}</Staff>`).join('\n    ')}
    ${parts.map(([name]) => `<Part>
      <Staff><StaffType><name>stdNormal</name></StaffType></Staff>
      <trackName>${name}</trackName>
      <Instrument><longName>${name}</longName><shortName>Sl</shortName><instrumentId>test.solo</instrumentId><Channel><synti>Fluid</synti></Channel></Instrument>
    </Part>`).join('\n    ')}
  </Score>
</museScore>`;

const textNode = (text) => ({ get: (name) => (name === 'text' ? text : null) });

test('renderRehearsalMark: quotes and backslashes in the label are escaped', t => {
    t.is(renderRehearsalMark(textNode('A "bis" \\ B')), '\\mark \\markup { \\box "A \\"bis\\" \\\\ B" }');
});

test('renderTempo: quotes and backslashes in free text are escaped', t => {
    t.is(renderTempo({ tempoText: 'Allegro "con brio"' }), '\\tempo "Allegro \\"con brio\\""');
});

const tempoXml = (textXml) => syntheticScore(`<Measure><voice>
  <Tempo><tempo>2</tempo><text>${textXml}</text></Tempo>
  <Rest><durationType>measure</durationType><duration>4/4</duration></Rest>
</voice></Measure>`);

test('parseTempo: formatting inside free text is dropped and the words keep their order', async t => {
    const result = await convertSynthetic(tempoXml('Molto <b>Allegro</b> con <i>brio</i>'));
    t.true(result.music.includes('\\tempo "Molto Allegro con brio"'), result.music);
});

maybeTest('tempotests.mscz', 'tempotests: plain text, metronome and tempo primo marks render', async t => {
    const result = await convertFile('tests/tempotests.mscz');
    t.true(result.music.includes('\\tempo "Lento"'));
    t.true(result.music.includes('\\tempo 4 = 80'));
    t.true(result.music.includes('\\tempo "tempo primo"'));
});

test('voicing: a KeySig-only voice 0 does not drop the music in voice 1', async t => {
    const result = await convertSynthetic(syntheticScore(`<Measure>
  <voice><KeySig><concertKey>0</concertKey></KeySig></voice>
  <voice><Rest><durationType>quarter</durationType></Rest></voice>
</Measure>`));
    t.true(result.music.includes('\\key c \\major'), result.music);
    t.true(result.music.includes('r4'), result.music);
});

test('tuplets: a single-event tuplet both opens and closes on that event', async t => {
    const result = await convertSynthetic(syntheticScore(`<Measure><voice>
  <Tuplet actualNotes="3" normalNotes="2"/>
  <Rest><durationType>quarter</durationType></Rest>
  <endTuplet/>
  <Rest><durationType>half</durationType></Rest>
</voice></Measure>`));
    t.true(result.music.includes('\\tuplet 3/2 { r4 }'), result.music);
});

test('tuplets: a Dynamic as the first tuplet event does not leak "undefined" into the output', async t => {
    const result = await convertSynthetic(syntheticScore(`<Measure><voice>
  <Tuplet actualNotes="3" normalNotes="2"/>
  <Dynamic><subtype>p</subtype></Dynamic>
  <Rest><durationType>eighth</durationType></Rest>
  <Rest><durationType>eighth</durationType></Rest>
  <Rest><durationType>eighth</durationType></Rest>
  <endTuplet/>
</voice></Measure>`));
    t.false(result.music.includes('undefined'), result.music);
});

test('parts: parts sharing a name get running numbers in music, score and parts', async t => {
    const result = await convertSynthetic(syntheticScore(
        '<Measure><voice><Rest><durationType>measure</durationType><duration>4/4</duration></Rest></voice></Measure>',
        [['Flute', 1], ['Flute', 2], ['Oboe', 3]]));
    t.true(result.music.includes('fluteOne = {'), result.music);
    t.true(result.music.includes('fluteTwo = {'), result.music);
    t.true(result.music.includes('oboe = {'), result.music);
    t.true(result.score.includes('\\fluteOne'), result.score);
    t.true(result.score.includes('\\fluteTwo'), result.score);
    t.true(result.parts.includes('\\bookOutputSuffix "Flute1"'), result.parts);
    t.true(result.parts.includes('\\bookOutputSuffix "Flute2"'), result.parts);
    t.true(result.parts.includes('\\bookOutputSuffix "Oboe"'), result.parts);
});

test('applyRepeats: brace closing an ending stays off the line of a bar-number comment', t => {
    const measures = ['body | % 1', 'end1 | % 2', 'end2 | % 3'];
    const regions = [{
        startIndex: 0, bodyEndIndex: 0, count: 2,
        endings: [{ startIndex: 1, endIndex: 1, number: 1 }, { startIndex: 2, endIndex: 2, number: 2 }],
    }];
    const [out] = applyRepeats(measures, regions);
    out.split('\n').filter(l => l.includes('%')).forEach(l => t.false(l.includes('}'), l));
});

test('applyRepeats: a repeat whose first ending opens the region keeps the ending measures', t => {
    const measures = ['end1', 'end2'];
    const regions = [{
        startIndex: 0, bodyEndIndex: -1, count: 2,
        endings: [{ startIndex: 0, endIndex: 0, number: 1 }, { startIndex: 1, endIndex: 1, number: 2 }],
    }];
    const out = applyRepeats(measures, regions);
    t.is(out.length, 1);
    t.true(out[0].startsWith('\\repeat volta 2 { }'), out[0]);
    t.true(out[0].includes('{ end1\n    }'), out[0]);
    t.true(out[0].includes('{ end2\n    }'), out[0]);
    t.false(out[0].includes('undefined'));
});

test('analyzeRepeats: a lone first ending that still repeats keeps the repeat and adds an unbracketed final pass', t => {
    const markers = [
        marker({}),
        marker({ endRepeat: '2', voltaStart: { endings: 1, span: 1 } }),
        marker({}),
    ];
    const regions = analyzeRepeats(markers);
    t.is(regions.length, 1);
    t.is(regions[0].count, 2);
    t.true(regions[0].finalPassUnbracketed);
    const out = applyRepeats(['a', 'b', 'c'], regions);
    t.is(out.length, 2, 'the trailing unbracketed measure stays outside the alternatives');
    t.true(out[0].includes('\\repeat volta 2 {'));
    t.true(out[0].includes('{ b\n    }\n    { }'), out[0]);
    t.is(out[1], 'c');
});

test('tuplets: nested tuplets render balanced braces', async t => {
    const result = await convertSynthetic(syntheticScore(`<Measure><voice>
  <Tuplet actualNotes="3" normalNotes="2"/>
  <Rest><durationType>eighth</durationType></Rest>
  <Tuplet actualNotes="3" normalNotes="2"/>
  <Rest><durationType>16th</durationType></Rest>
  <Rest><durationType>16th</durationType></Rest>
  <Rest><durationType>16th</durationType></Rest>
  <endTuplet/>
  <Rest><durationType>eighth</durationType></Rest>
  <endTuplet/>
  <Rest><durationType>quarter</durationType></Rest>
</voice></Measure>`));
    t.true(result.music.includes('\\tuplet 3/2 { r8 \\tuplet 3/2 { r16 r16 r16 } r8 }'), result.music);
});

test('tuplets: a tuplet starting on a grace chord keeps the tuplet outside the grace group', async t => {
    const result = await convertSynthetic(syntheticScore(`<Measure><voice>
  <Tuplet actualNotes="3" normalNotes="2"/>
  <Chord><acciaccatura/><durationType>eighth</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>
  <Chord><durationType>eighth</durationType><Note><pitch>62</pitch><tpc>16</tpc></Note></Chord>
  <Chord><durationType>eighth</durationType><Note><pitch>64</pitch><tpc>18</tpc></Note></Chord>
  <Chord><durationType>eighth</durationType><Note><pitch>65</pitch><tpc>13</tpc></Note></Chord>
  <endTuplet/>
  <Rest><durationType>quarter</durationType></Rest>
</voice></Measure>`));
    t.regex(result.music, /\\acciaccatura \{ [^}]*\} \\tuplet 3\/2 \{ [^}]*\}/, result.music);
});

test('renderLyricTimings: grouped parts are keyed by their own track names, not "undefined"', async t => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.40">
  <programVersion>4.4.3</programVersion>
  <Score>
    <metaTag name="workTitle">Synthetic</metaTag>
    <Staff id="1"><Measure><voice><Rest><durationType>measure</durationType><duration>4/4</duration></Rest></voice></Measure></Staff>
    <Staff id="2"><Measure><voice><Rest><durationType>measure</durationType><duration>4/4</duration></Rest></voice></Measure></Staff>
    <Part>
      <Staff><bracket type="0" span="2" col="0" visible="1"/><StaffType><name>stdNormal</name></StaffType></Staff>
      <trackName>Soprano</trackName>
      <Instrument><longName>Soprano</longName><shortName>S</shortName><instrumentId>voice.soprano</instrumentId><Channel><synti>Fluid</synti></Channel></Instrument>
    </Part>
    <Part>
      <Staff><StaffType><name>stdNormal</name></StaffType></Staff>
      <trackName>Alto</trackName>
      <Instrument><longName>Alto</longName><shortName>A</shortName><instrumentId>voice.alto</instrumentId><Channel><synti>Fluid</synti></Channel></Instrument>
    </Part>
  </Score>
</museScore>`;
    const json = await xmlParser.parseStringPromise(xml);
    const timings = renderLyricTimings(new XmlWrapper(json.museScore));
    t.false('undefined' in timings, JSON.stringify(Object.keys(timings)));
    t.true('Soprano' in timings || 'Alto' in timings, JSON.stringify(Object.keys(timings)));
});

const voltaSpanner = (endings, span = 1) => ({
    name: 'Spanner',
    get: (key) => ({
        type: 'Volta',
        Volta: { get: (k) => (k === 'endings' ? endings : null) },
        next: { get: () => ({ get: () => String(span) }) },
    })[key] ?? null,
});

test('findVoltaStart: a bracket covering several passes ("1,2") counts the highest pass', t => {
    t.deepEqual(findVoltaStart([[voltaSpanner('1,2')]]), { endings: 2, span: 1 });
    t.deepEqual(findVoltaStart([[voltaSpanner('3')]]), { endings: 3, span: 1 });
});

test('analyzeRepeats: "1,2" followed by "3" is a three-pass repeat', t => {
    const markers = [
        marker({}),
        marker({ endRepeat: '2', voltaStart: { endings: 2, span: 1 } }),
        marker({ voltaStart: { endings: 3, span: 1 } }),
    ];
    t.is(analyzeRepeats(markers)[0].count, 3);
});

test('parts: a generated number never reuses the name of a part that already has it', async t => {
    const result = await convertSynthetic(syntheticScore(
        '<Measure><voice><Rest><durationType>measure</durationType><duration>4/4</duration></Rest></voice></Measure>',
        [['Flute', 1], ['Flute', 2], ['Flute1', 3]]));
    t.is(result.music.match(/fluteOne = \{/g).length, 1, result.music);
    t.true(result.music.includes('fluteTwo = {'), result.music);
    t.true(result.music.includes('fluteThree = {'), result.music);
    ['Flute1', 'Flute2', 'Flute3'].forEach(n => t.true(result.parts.includes(`\\bookOutputSuffix "${n}"`), n));
});

test('renderRehearsalMark: a formatted label (<b>A</b>) renders its text, not [object Object]', async t => {
    const result = await convertSynthetic(syntheticScore(`<Measure><voice>
  <RehearsalMark><text><b>A</b></text></RehearsalMark>
  <Rest><durationType>measure</durationType><duration>4/4</duration></Rest>
</voice></Measure>`));
    t.true(result.music.includes('\\mark \\markup { \\box "A" }'), result.music);
});

test('parts: staff identifiers of a multi-staff part never collide with another part\'s name', async t => {
    const rest = '<Measure><voice><Rest><durationType>measure</durationType><duration>4/4</duration></Rest></voice></Measure>';
    const part = (name, staffCount) => `<Part>
      ${'<Staff><StaffType><name>stdNormal</name></StaffType></Staff>'.repeat(staffCount)}
      <trackName>${name}</trackName>
      <Instrument><longName>${name}</longName><shortName>P</shortName><instrumentId>keyboard.piano</instrumentId><Channel><synti>Fluid</synti></Channel></Instrument>
    </Part>`;
    const result = await convertSynthetic(`<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.40">
  <programVersion>4.4.3</programVersion>
  <Score>
    <metaTag name="workTitle">Synthetic</metaTag>
    <metaTag name="movementTitle">Synthetic Movement</metaTag>
    <Staff id="1">${rest}</Staff><Staff id="2">${rest}</Staff><Staff id="3">${rest}</Staff>
    ${part('Piano', 2)}
    ${part('Piano1', 1)}
  </Score>
</museScore>`);
    const defined = [...result.music.matchAll(/^(\w+) = \{/gm)].map(m => m[1]);
    t.is(defined.length, 3, result.music);
    t.is(new Set(defined).size, 3, `duplicate identifiers: ${defined}`);
    defined.forEach(id => t.true(result.score.includes(`\\${id}`), `${id} not used in score`));
});

test('createValidPartName: punctuation becomes a single inner underscore, never leading or trailing', t => {
    t.is(createValidPartName('Violin 1'), 'violinOne');
    t.is(createValidPartName('Vln.'), 'vln');
    t.is(createValidPartName('Clarinet (Bb)'), 'clarinet_bb');
    t.is(createValidPartName('Soprano/Alto'), 'soprano_alto');
    t.is(createValidPartName('A.S. 2'), 'a_s_Two');
    t.is(createValidPartName('Flûte'), 'flûte');
});

test('createValidPartName: a name without any letters still gives a usable identifier', t => {
    t.is(createValidPartName('...'), 'part');
    t.is(createValidPartName(''), 'part');
});

test('parts: names that only differ in punctuation get distinct identifiers', async t => {
    const result = await convertSynthetic(syntheticScore(
        '<Measure><voice><Rest><durationType>measure</durationType><duration>4/4</duration></Rest></voice></Measure>',
        [['Vln.', 1], ['Vln', 2]]));
    const defined = [...result.music.matchAll(/^(\w+) = \{/gm)].map(m => m[1]);
    t.is(new Set(defined).size, 2, result.music);
    defined.forEach(id => t.false(/^_|_$|__/.test(id), id));
});

// Randomised invariant check: whatever mix of names and staff counts a score has, every name,
// music identifier, and book key must be unique and valid. Hand-picked cases kept missing the next variant.
test('createPartNamer: names and music identifiers stay unique and valid for any mix of parts', t => {
    let seed = 12345;
    const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const pool = ['Piano', 'Piano1', 'Piano 1', 'piano', 'PIANO', 'Piano2', 'Piano11', 'Flute', 'Flute1', 'Flute 1',
        'Vln.', 'Vln', 'Vln 1', 'Violin I', 'Clarinet (Bb)', 'Soprano/Alto', '...', '', 'Part', 'Part1', 'Flûte',
        'Drums', 'Drums1', 'DrumsPart', 'Lyrics', 'Tempo'];
    const validId = /^[\p{L}\p{M}]+(_[\p{L}\p{M}]+)*$/u;
    for (let run = 0; run < 2000; run++) {
        const makePart = () => ({ trackName: pool[rand(pool.length)], staffs: new Array(1 + rand(3)) });
        const partsInfo = Array.from({ length: 1 + rand(7) }, () => (
            rand(4) === 0 ? { isSection: true, parts: Array.from({ length: 1 + rand(3) }, makePart) } : makePart()));
        const nameFor = createPartNamer(partsInfo);
        const names = new Set();
        const ids = new Set();
        let total = 0;
        partsInfo.flatMap(p => p.isSection ? p.parts : [p]).forEach((part) => {
            const name = nameFor(part);
            const partIds = musicIdentifiers(name, part.staffs.length);
            names.add(name.toLowerCase());
            partIds.forEach(id => {
                ids.add(id);
                t.regex(id, validId, `invalid identifier "${id}" for "${name}"`);
                t.false(lilypondKeywords.has(id), `"${id}" is a LilyPond keyword`);
            });
            total += partIds.length;
        });
        const parts = partsInfo.flatMap(p => p.isSection ? p.parts : [p]);
        if (names.size !== parts.length || ids.size !== total) {
            t.fail(`collision in ${JSON.stringify(parts.map(p => [p.trackName, p.staffs.length]))}`);
            return;
        }
    }
    t.pass();
});

test('voicing: a measure holding only an unsupported chord duration still gets a spacer', async t => {
    const result = await convertSynthetic(syntheticScore(`<Measure><voice>
  <Chord><durationType>1024th</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>
</voice></Measure>
<Measure><voice>
  <Rest><durationType>measure</durationType><duration>4/4</duration></Rest>
</voice></Measure>`));
    t.true(result.music.includes('s1'), result.music);
});

test('createValidPartName: names that are LilyPond keywords get a suffix so the variable stays usable', t => {
    t.is(createValidPartName('Drums'), 'drumsPart');
    t.is(createValidPartName('Lyrics'), 'lyricsPart');
    t.is(createValidPartName('Tempo'), 'tempoPart');
    t.is(createValidPartName('Drums 2'), 'drumsTwo');
});

test('escaping: play-technique text, instrument names and titles cannot break out of their LilyPond string', async t => {
    const xml = syntheticScore(`<Measure><voice>
  <PlayTechAnnotation><text>pizz. "x"</text></PlayTechAnnotation>
  <Chord><durationType>whole</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>
</voice></Measure>`, [['Flute "I"', 1]]).replace('>Synthetic<', '>He said "hi"<');
    const result = await convertSynthetic(xml);
    t.true(result.music.includes('^\\markup { \\italic "pizz. \\"x\\"" }'), result.music);
    t.true(result.score.includes('instrumentName = "Flute \\"I\\""'), result.score);
    t.true(result.score.includes('title = "He said \\"hi\\""'), result.score);
});

test('escaping: a lyric word containing LilyPond syntax characters is quoted', async t => {
    const result = await convertSynthetic(syntheticScore(`<Measure><voice>
  <Chord><durationType>whole</durationType><Lyrics><syllabic>single</syllabic><text>a{b\\c</text></Lyrics><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>
</voice></Measure>`));
    t.true(result.score.includes('"a{b\\\\c"'), result.score);
});

test('parts: a part book with lyrics wraps the music in its voice and runs staff and lyrics together', async t => {
    const result = await convertSynthetic(syntheticScore(`<Measure><voice>
  <Chord><durationType>whole</durationType><Lyrics><syllabic>end</syllabic><text>la</text></Lyrics><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>
</voice></Measure>`));
    const book = result.parts;
    t.true(/<<\s*\\new Staff \{[\s\S]*\\new Voice = "solo" \{\s*\\solo\s*\}[\s\S]*\\new Lyrics \\lyricsto "solo" \{[\s\S]*\}\s*>>/.test(book), book);
    t.is((book.match(/\{/g) || []).length, (book.match(/\}/g) || []).length, 'unbalanced braces');
});
