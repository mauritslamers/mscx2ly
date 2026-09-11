This folder contains the reference results, the lilypond files to test against.
In case of improvements in the conversion, these files can be updated.

These files (and the MuseScore source fixtures in `tests/`) are gitignored and
never committed: many are real, copyrighted songs/arrangements. They only
exist locally, wherever they were placed by hand. Tests in `test.js` and
`structure.test.js` check for each fixture before running and skip (rather
than fail) when it is missing, so `npm test` still passes on a fresh clone or
in CI without them.

Regenerate a reference file deliberately with the CLI, e.g.:

    node bin/mscx2ly.js tests/enrose.mscz tests/reference_results/enrose.ly

Never regenerate straight into `tests/` itself — that is where ad hoc/manual
conversions are meant to be run, so it does not double as the golden-file
location and get overwritten by accident.
