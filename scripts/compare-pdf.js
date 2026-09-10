#!/usr/bin/env node
// Proof of concept: render a MuseScore file's PDF and mscx2ly's LilyPond PDF
// side by side, so differences can be spotted by eye instead of by opening
// MuseScore manually for every fixture.
//
// Usage:
//   node scripts/compare-pdf.js <source.mscz|source.mscx> [--musescore <path>] [--out <dir>]
//
// MuseScore location resolution order: --musescore flag, MSCX2LY_MUSESCORE
// env var, then a few common command names on PATH (mscore, musescore,
// musescore4portable, mscore4portable). Point it at your MuseScore AppImage
// if you have no system install, e.g.:
//   MSCX2LY_MUSESCORE=~/Applications/MuseScore-Studio-4.6.3.AppImage \
//     node scripts/compare-pdf.js tests/enrose.mscz

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const parseArgs = (argv) => {
    const [sourceFile, ...rest] = argv;
    const flag = (name) => {
        const i = rest.indexOf(name);
        return i === -1 ? null : rest[i + 1];
    };
    return { sourceFile, museScoreBin: flag('--musescore'), outDir: flag('--out') };
};

const findMuseScore = (explicit) => {
    if (explicit) return explicit;
    if (process.env.MSCX2LY_MUSESCORE) return process.env.MSCX2LY_MUSESCORE;
    for (const candidate of ['mscore', 'musescore', 'musescore4portable', 'mscore4portable']) {
        try {
            execFileSync('which', [candidate], { stdio: 'pipe' });
            return candidate;
        } catch {
            // not on PATH, try the next candidate
        }
    }
    return null;
};

const { sourceFile, museScoreBin: explicitMuseScore, outDir: outDirArg } = parseArgs(process.argv.slice(2));

if (!sourceFile || !existsSync(sourceFile)) {
    console.error('Usage: node scripts/compare-pdf.js <source.mscz|source.mscx> [--musescore <path>] [--out <dir>]');
    process.exit(1);
}

const museScoreBin = findMuseScore(explicitMuseScore);
if (!museScoreBin) {
    console.error('Could not find a MuseScore executable. Pass one with --musescore <path>, or set MSCX2LY_MUSESCORE, e.g.:');
    console.error('  MSCX2LY_MUSESCORE=~/Applications/MuseScore-Studio-4.6.3.AppImage node scripts/compare-pdf.js tests/enrose.mscz');
    process.exit(1);
}

const name = path.basename(sourceFile).replace(/\.(mscz|mscx)$/i, '');
// Scratch space for generated PDFs — gitignored, never the golden-file location.
const outDir = outDirArg || path.join('tests', 'pdf_compare', name);
mkdirSync(outDir, { recursive: true });

const lyFile = path.join(outDir, `${name}.ly`);
const lilypondPdf = path.join(outDir, `${name}.pdf`);
const museScorePdf = path.join(outDir, `${name}.musescore.pdf`);

// execFileSync throws on a non-zero exit with a raw stack trace; these steps
// shell out to external tools that regularly fail for reasons outside our
// control (unsupported file version, missing binary, ...), so report those
// as a plain error message instead of a crash.
const step = (label, command, args) => {
    console.log(label);
    try {
        execFileSync(command, args, { stdio: 'inherit' });
    } catch (e) {
        console.error(`\n${label} failed (exit code ${e.status ?? 'unknown'}).`);
        return false;
    }
    return true;
};

if (!step(`[1/3] Converting ${sourceFile} -> ${lyFile}`, 'node', [path.join(repoRoot, 'bin', 'mscx2ly.js'), sourceFile, lyFile])) {
    process.exit(1);
}

if (!step(`[2/3] Compiling ${lyFile} with LilyPond`, 'lilypond', ['-o', path.join(outDir, name), lyFile])) {
    process.exit(1);
}

if (!step(`[3/3] Exporting ${sourceFile} to PDF with MuseScore (${museScoreBin})`, museScoreBin, ['-o', museScorePdf, sourceFile])) {
    console.error(`MuseScore (${museScoreBin}) could not export this file — often a sign the binary is a`);
    console.error('different/older MuseScore version than the file was saved with. Try pointing at a');
    console.error('different install with --musescore <path> or MSCX2LY_MUSESCORE, e.g. a newer AppImage.');
    process.exit(1);
}

console.log('\nDone. Compare by eye:');
console.log(`  MuseScore: ${museScorePdf}`);
console.log(`  LilyPond:  ${lilypondPdf}`);
