# End-to-end tests

Browser tests for the Ascender UI, driven by [Playwright](https://playwright.dev).

These cover what the jest suite in `awx/ui/src` cannot. That suite runs in jsdom,
which does not faithfully reproduce event bubbling through the DOM, focus, or
anything rendered through a portal. #742 is the worked example: a jest test for
"picking a job navigates" passed against code where the click did nothing in
every real browser.

## Running them

They need a development environment already up, the one `make docker-compose`
starts, with the UI built into it:

```bash
make docker-compose            # in one terminal, from the repository root
docker exec tools_awx_1 make ui-devel
```

Then, from this directory:

```bash
npm ci
npx playwright install --with-deps chromium
npm test
```

`npm test` seeds its own fixtures first, so it needs no particular state beyond
a running instance.

## Configuration

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `ASCENDER_URL` | `https://localhost:8043` | Where the instance is |
| `ASCENDER_USERNAME` | `admin` | Account the specs log in as |
| `ASCENDER_PASSWORD` | `password` | Its password, which is what the CI environment sets |
| `ASCENDER_TOKEN` | unset | Used by the seed instead of a password, if you prefer |

## The fixtures

`seed.js` runs once before the specs and writes `fixtures.json`. It creates a
workflow job template named `e2e-workflow` out of system job templates, runs it,
and records the job each node produced.

System job templates are used deliberately: every instance has them, they need no
project, inventory, credential or network access, and they finish in seconds. It
also means the specs navigate under `/jobs/management/`, exercising a url segment
other than the default one.

The workflow job template is reused on later runs. It is safe to delete.

## Adding a spec

Keep them few and about flows that would be expensive to break. Assert on the url
and on what is rendered, not on component internals, and use `watchConsole` where
the page should be quiet: an unexpected console error is usually a real defect,
and two of the three found in #742 announced themselves that way.
