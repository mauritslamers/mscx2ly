import test from 'ava';
import { existsSync, readFileSync } from 'fs';
import admZip from 'adm-zip';
import xml2js from 'xml2js';
import { XmlWrapper } from './xml_wrapper.js';
import { convertMSCX2LY } from './lib.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Real MuseScore fixtures and their reference LilyPond output are gitignored
// (many are copyrighted songs/arrangements, see tests/reference_results/readme.md)
// so they only exist on machines that were given them locally. Skip rather than
// fail when a fixture is missing, so `npm test` stays green on a fresh clone/CI.
const fixture = (relPath) => `tests/${relPath}`;
const hasFixtures = (...relPaths) => relPaths.every(relPath => existsSync(fixture(relPath)));
const maybeTest = (relPaths, title, impl) => (hasFixtures(...relPaths) ? test : test.skip)(title, impl);

/**
 * Read an .mscz (zip) or .mscx (plain XML) source file, parse it, run the
 * conversion and return the combined LilyPond string exactly as index.js
 * would write it to disk.
 */
const convertFile = async (sourceFile, options = {}) => {
    let source;
    try {
        const zip = new admZip(sourceFile);
        const entry = zip.getEntries().find(e => e.entryName.endsWith('.mscx'));
        source = zip.readAsText(entry);
    } catch {
        source = readFileSync(sourceFile, 'utf8');
    }
    const parser = new xml2js.Parser({ preserveChildrenOrder: true, explicitChildren: true, charsAsChildren: true });
    const json = await parser.parseStringPromise(source);
    const data = new XmlWrapper(json.museScore);
    // omitMusic/omitScore/omitParts are not renderingOptions understood by
    // convertMSCX2LY; index.js applies them when assembling the output file,
    // so replicate that assembly here rather than passing them straight through.
    const { omitMusic, omitScore, omitParts, ...renderingOptions } = options;
    const result = convertMSCX2LY(data, renderingOptions);
    let out = '\\version "2.24.0"\n\n';
    if (!omitMusic) out += result.music + '\n';
    if (!omitScore) out += result.score + '\n';
    if (!omitParts) out += result.parts;
    return out;
};

const golden = (name) => readFileSync(`tests/reference_results/${name}.ly`, 'utf8');

// ---------------------------------------------------------------------------
// Golden-file tests
// These compare the full LilyPond output against the checked-in .ly files.
// ---------------------------------------------------------------------------

maybeTest(['articulations.mscz', 'reference_results/articulations.ly'], 'articulations — golden output', async t => {
    const out = await convertFile('tests/articulations.mscz');
    t.is(out, golden('articulations'));
});

maybeTest(['all_barlines.mscz', 'reference_results/all_barlines.ly'], 'all_barlines — golden output', async t => {
    const out = await convertFile('tests/all_barlines.mscz');
    t.is(out, golden('all_barlines'));
});

maybeTest(['test.mscz', 'reference_results/test.ly'], 'test score — golden output', async t => {
    const out = await convertFile('tests/test.mscz');
    t.is(out, golden('test'));
});

maybeTest(['SimpleGifts.mscx', 'reference_results/SimpleGifts.ly'], 'SimpleGifts (uncompressed .mscx) — golden output', async t => {
    const out = await convertFile('tests/SimpleGifts.mscx');
    t.is(out, golden('SimpleGifts'));
});

maybeTest(['enrose.mscz', 'reference_results/enrose.ly'], 'enrose — golden output', async t => {
    const out = await convertFile('tests/enrose.mscz');
    t.is(out, golden('enrose'));
});

// ---------------------------------------------------------------------------
// Crash-safety tests
// These do not compare output — they just verify that the conversion completes
// without throwing for files known to exercise tricky code paths.
// ---------------------------------------------------------------------------

maybeTest(['carol_of_the_bells.mscz'], 'carol_of_the_bells — does not throw', async t => {
    await t.notThrowsAsync(() => convertFile('tests/carol_of_the_bells.mscz'));
});

maybeTest(['Hairpins.mscz'], 'Hairpins — does not throw', async t => {
    await t.notThrowsAsync(() => convertFile('tests/Hairpins.mscz'));
});

maybeTest(['fermatas_breathes_caesuras.mscz'], 'fermatas_breathes_caesuras — does not throw', async t => {
    await t.notThrowsAsync(() => convertFile('tests/fermatas_breathes_caesuras.mscz'));
});

maybeTest(['marijn.mscz'], 'marijn — does not throw', async t => {
    await t.notThrowsAsync(() => convertFile('tests/marijn.mscz'));
});

maybeTest(['sto_te_nema.mscz'], 'sto_te_nema — does not throw', async t => {
    await t.notThrowsAsync(() => convertFile('tests/sto_te_nema.mscz'));
});

// ---------------------------------------------------------------------------
// Rendering option tests
// ---------------------------------------------------------------------------

maybeTest(['articulations.mscz'], 'omitMusic — output contains no music macro', async t => {
    const out = await convertFile('tests/articulations.mscz', { omitMusic: true });
    // With omitMusic the result.music should be empty; no named macro assignments
    t.false(out.includes(' = {'));
});

maybeTest(['articulations.mscz'], 'omitScore — output contains no \\score block', async t => {
    // parts also emit their own \score block, so omit those too to isolate
    // the score section's \score block specifically
    const out = await convertFile('tests/articulations.mscz', { omitScore: true, omitParts: true });
    t.false(out.includes('\\score'));
});

maybeTest(['carol_of_the_bells.mscz'], 'omitParts — output contains no \\book block for parts', async t => {
    // carol_of_the_bells has multiple parts so this is a meaningful check
    const withParts = await convertFile('tests/carol_of_the_bells.mscz');
    const withoutParts = await convertFile('tests/carol_of_the_bells.mscz', { omitParts: true });
    t.true(withParts.includes('\\book'));
    t.true(withoutParts.length < withParts.length);
});
