import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const fixtureDir = (name: string): string =>
  path.join(__dirname, name);
