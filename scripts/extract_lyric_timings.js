import fs from 'fs';
import xml2js from 'xml2js';
import { renderLyricTimings } from '../lib.js';
import admZip from 'adm-zip';
import { XmlWrapper } from '../xml_wrapper.js';
import { detectVersion } from '../compat.js';

const parser = new xml2js.Parser({ preserveChildrenOrder: true, explicitChildren: true, charsAsChildren: true });

async function parseMuseScoreXML(sourceFile) {
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
        source = fs.readFileSync(sourceFile, 'utf8');
    }

    let json;
    try {
        // convert to json
        const parser = new xml2js.Parser({ preserveChildrenOrder : true, explicitChildren: true, charsAsChildren: true});
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
        result = renderLyricTimings(data);
    }
    catch (e) {
        const errorlog = e.stack;
        fs.writeFileSync('error.log', errorlog);
        console.error('Could not convert source file. Exiting.');
        process.exit(1);
    }
    // write out json
    fs.writeFileSync('timing.json', JSON.stringify(result, null, 2));	
}

function getTempo(score) {
    const tempoElements = score.Tempo || [];
    if (tempoElements.length > 0) {
        return parseInt(tempoElements[0].text[0]);
    }
    return 120; // Default to 120 BPM
}


function convertTicksToSeconds(ticks, ticksPerQuarter, tempo) {
    const beatsPerSecond = tempo / 60;
    const secondsPerTick = 1 / (beatsPerSecond * ticksPerQuarter);
    return ticks * secondsPerTick;
}

// Example usage
parseMuseScoreXML("tests/calmes_for_lyrics.mscz");
