# Network test report

Every functional page test listens for failed requests, HTTP errors ≥ 400, console errors,
JavaScript exceptions and any request to the original host (`tests/helpers/fixtures.mjs`).

**Local build (final run, 2026-10-07): no problems** on any of the 20 pages, the 404 pages or
the search page. The only third-party requests are the Google Maps iframe (excluded from the
assertions as an intentional embed). Browser-cancelled media range requests of the background
video (`net::ERR_ABORTED`) are normal and ignored.

Problems observed on the **original site** during the migration (not present in the static site):
- frequent `ERR_TIMED_OUT` on page loads under light load;
- the footer campus logo (`www.fi.upm.es`) and other hot-linked images intermittently failing;
- dead external links: `http://sasover.com`, `https://www.upm.es/Estudiantes/EmpleoPracticas`.
