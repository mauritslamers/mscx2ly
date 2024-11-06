import { convertMSCX2LY } from './lib.js';
import fs from 'fs';
import xml2js from 'xml2js';
import { XmlWrapper } from './xml_wrapper.js';

export const mscx2ly = async ({
    sourceFile,
    outputFile,
    separateMusic,
    separateScore,
    separateParts,
    musicFile,
    scoreFile,
    partsFile,
    scorePaperSize,
    partsPaperSize,
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
    const source = fs.readFileSync(sourceFile, 'utf8');
    // convert to json
    const parser = new xml2js.Parser({ preserveChildrenOrder : true, explicitChildren: true});
    const json = await parser.parseStringPromise(source);
    // convert to a format we can interact with
    const data = new XmlWrapper(json.museScore);
    const result = convertMSCX2LY(data, { scorePaperSize, partsPaperSize });
    // write output
    let main = '\\version "2.24.0"\n\n';
    if (!separateMusic) {
        main += result.music + "\n";
    }
    if (!separateScore) {
        main += result.score + "\n";
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
