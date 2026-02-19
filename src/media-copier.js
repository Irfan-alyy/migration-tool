// src/media-copier.js
import fs from 'fs-extra';
import path from 'path';

export async function copyMedia(mediaSource, publicDir, project) {
  if (!mediaSource || !await fs.pathExists(mediaSource)) {
    console.log(`⚠️ Media source not found: ${mediaSource}`);
    return false;
  }
  const targetDir = path.join(publicDir, project);
  await fs.ensureDir(targetDir);
  await fs.copy(mediaSource, targetDir);
  console.log(`✅ Media copied to ${targetDir}`);
  return true;
}