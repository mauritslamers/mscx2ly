// Helpers for differences between MuseScore file format versions.

/**
 * @param {XmlWrapper} data the root <museScore> element
 */
export function detectVersion(data) {
    const createdWith = data.get('programVersion');
    const [programMajor, programMinor, programPatch] = createdWith.split('.');
    const formatVersionText = data.get('version');
    const [formatMajor, formatMinor] = formatVersionText.split('.');
    return {
        createdWith: {
            major: parseInt(programMajor, 10),
            minor: parseInt(programMinor, 10),
            patch: parseInt(programPatch, 10),
            text: createdWith,
        },
        formatVersion: {
            major: parseInt(formatMajor, 10),
            minor: parseInt(formatMinor, 10),
            text: formatVersionText,
            value: parseInt(formatMajor, 10) * 100 + parseInt(formatMinor, 10),
        },
    };
}

// Fallback when no format version is known — assume newest.
export const LATEST_FORMAT_VERSION = 999;

/**
 * A staff's own identifier: the legacy `id` attribute, or the `<eid>` element
 * used by newer files. Informational only — which score staff a part's staff
 * corresponds to is resolved by document position (see readPartInfo), since
 * <Score><Staff id="N"> is a position index, not a key shared with <eid>.
 * @param {XmlWrapper} staff
 * @returns {string|null}
 */
export function getStaffId(staff) {
    if (!staff) return null;
    const id = staff.get('id');
    if (id) return id;
    const eid = staff.get('eid');
    if (eid) return eid.text || eid;
    return null;
}
