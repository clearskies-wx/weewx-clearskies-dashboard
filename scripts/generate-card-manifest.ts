// generate-card-manifest.ts — Build-time script that reads card metadata
// and writes public/card-manifest.json.
//
// Run via: npx tsx scripts/generate-card-manifest.ts
// Invoked automatically as the "prebuild" npm script before tsc -b && vite build.
//
// This script intentionally imports ONLY from card-metadata.ts (no React)
// so it can run in a plain Node.js context via tsx.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_METADATA } from '../src/lib/card-metadata.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = resolve(__dirname, '..');
const outputPath = resolve(repoRoot, 'public', 'card-manifest.json');

interface ManifestCard {
  type: string;
  displayName: string;
  apiEndpoints: string[];
  allowedLayouts: Array<{ footprint: string; rowSpan: number }>;
  thumbnail: string;
}

interface CardManifest {
  version: 1;
  cards: ManifestCard[];
}

const cards: ManifestCard[] = Object.values(CARD_METADATA).map(meta => ({
  type: meta.type,
  displayName: meta.displayName,
  apiEndpoints: meta.apiEndpoints,
  allowedLayouts: meta.allowedLayouts,
  thumbnail: meta.thumbnail,
}));

const manifest: CardManifest = {
  version: 1,
  cards,
};

// Ensure public/ exists (it always does in this repo, but be defensive).
mkdirSync(resolve(repoRoot, 'public'), { recursive: true });

writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`card-manifest.json written: ${cards.length} cards → ${outputPath}`);
