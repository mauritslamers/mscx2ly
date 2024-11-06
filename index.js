import { convertMSCX2LY } from './lib.js';
import fs from 'fs';
import xml2js from 'xml2js';
import { XmlWrapper } from './xml_wrapper.js';
import admZip from 'adm-zip';

function detectVersion (data) {
    const createdWith = data.get('programVersion');
    const [ programMajor, programMinor, programPatch] = createdWith.split('.');
    const formatVersion = data.get('version');
    const [ formatMajor, formatMinor] = formatVersion.split('.');
    return { 
        createdWith: {
            major: parseInt(programMajor, 10),
            minor: parseInt(programMinor, 10),
            patch: parseInt(programPatch, 10),
            text: createdWith
        }, 
        formatVersion: {
            major: parseInt(formatMajor, 10),
            minor: parseInt(formatMinor, 10),
            text: formatVersion
        }
    };
}



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
    scoreStaffSize,
    partsStaffSize
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
    // we first try to read the source file as a zip
    // if that fails, we assume it is a text file
    let source;
    try {
        const zip = new admZip(sourceFile);
        const zipEntries = zip.getEntries();
        const mscxEntry = zipEntries.find(entry => entry.entryName.endsWith('.mscx'));
        // read source file
        // const source = fs.readFileSync(sourceFile, 'utf8');
        source = zip.readAsText(mscxEntry);
    }
    catch (e) {
        // console.log('Could not read source file as zip. Assuming it is an uncompressed MuseScore file.');
        source = fs.readFileSync(sourceFile, 'utf8');
    }

    let json;
    try {
        // convert to json
        const parser = new xml2js.Parser({ preserveChildrenOrder : true, explicitChildren: true});
        json = await parser.parseStringPromise(source);
    }
    catch (e) {
        console.error('Could not parse source file. Is it a MuseScore file? Exiting.');
        process.exit(1);
    }
    let result;
    try {
        // convert to a format we can interact with
        const data = new XmlWrapper(json.museScore);
        const versions = detectVersion(data);
        if (versions.createdWith.major < 4 || versions.formatVersion.major < 4) {
            console.warn(`This file was created with an older version of MuseScore ${versions.createdWith.text}. Fingers crossed!`);
        }
        result = convertMSCX2LY(data, { 
            scorePaperSize, 
            partsPaperSize,
            scoreStaffSize,
            partsStaffSize
        });
    }
    catch (e) {
        const errorlog = e.stack;
        fs.writeFileSync('error.log', errorlog);
        console.error('mscx2ly encountered an error during the conversion process. Please report this issue on Github:');
        console.error('https://github.com/mauritslamers/mscx2ly/issues');
        console.error('Please include the generated error.log file and if possible the source file. Thank you!');
        process.exit(1);
    }

    try {
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
    catch (e) {
        console.log(e);
        console.error('Could not write output files. Exiting.');
        process.exit(1);
    }
}
