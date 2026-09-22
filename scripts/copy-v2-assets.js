import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist');
const assetsDir = resolve(__dirname, '../android/app/src/main/assets');

function copyRecursiveSync(src, dest) {
  if (statSync(src).isDirectory()) {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    readdirSync(src).forEach(child => {
      copyRecursiveSync(resolve(src, child), resolve(dest, child));
    });
  } else {
    copyFileSync(src, dest);
  }
}

if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
if (existsSync(distDir)) {
  readdirSync(distDir).forEach(item => {
    copyRecursiveSync(resolve(distDir, item), resolve(assetsDir, item));
  });
  console.log(`[copy-v2-assets] Copied ${readdirSync(distDir).length} files -> android/app/src/main/assets`);
} else {
  console.error('dist not found!');
}
