// Keeps Playwright's browser download inside the project when the portable
// toolchain in .tools/ is used. Harmless with a normal Node/Playwright install.
import fs from 'node:fs';
import path from 'node:path';
const local = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..', '.tools', 'pw-browsers');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(local)) process.env.PLAYWRIGHT_BROWSERS_PATH = local;
