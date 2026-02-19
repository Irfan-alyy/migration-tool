// src/markdown-writer.js
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

export async function writeMarkdownFile(outputDir, resource, tvs, toYAML) {
  const frontmatter = {
    title: resource.pagetitle,
    slug: resource.slug,
    description: resource.description || '',
    template: resource.template === 1 ? 'home' : 'standard',
    ...tvs.reduce((acc, tv) => ({ ...acc, [`tv_${tv.tmplvarid}`]: tv.value }), {}),
  };

  const yamlStr = toYAML(frontmatter);
  const body = resource.content || '';
  const fileContent = `---\n${yamlStr}---\n\n${body}`;
  const filePath = path.join(outputDir, `${resource.id}.md`);
  await fs.writeFile(filePath, fileContent);
  console.log(`  ✅ Written: ${filePath}`);
}

export function getYAMLStringifier() {
  // Use js-yaml directly for reliability
  return (obj) => yaml.dump(obj);
}