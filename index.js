import { convertMSCX2LY } from './lib.js';
import fs from 'fs';
import xml2js from 'xml2js';

export const mscx2ly = async ({
    sourceFile,
    outputFile,
    separateMusic,
    separateScore,
    separateParts,
    musicFile,
    scoreFile,
    partsFile,
}) => {
    // decide filenames
    if (separateMusic && !musicFile) {
        musicFile = `${outputFile}_music.ly`;
    }
    if (separateScore && !scoreFile) {
        scoreFile = `${outputFile}_score.ly`;
    }
    if (separateParts && !partsFile) {
        partsFile = `${outputFile}_parts.ly`;
    }
    // read source file
    const source = fs.readFileSync(source, 'utf8');
    // convert to json
    const parser = new xml2js.Parser();
    const json = await parser.parseStringPromise(source);
    const result = convertMSCX2LY(json);
    // write output
    let main = "";
    if (!separateMusic) {
        main += result.music;
    }
    if (!separateScore) {
        main += result.score;
    }
    if (!separateParts) {
        main += result.parts;
    }
    fs.writeFileSync(outputFile, main);
    if (separateMusic) {
        fs.writeFileSync(musicFile, result.music);
    }
    if (separateScore) {
        fs.writeFileSync(scoreFile, result.score);
    }
    if (separateParts) {
        fs.writeFileSync(partsFile, result.parts);
    }
    console.log('Conversion complete');
    process.exit(0);
}
