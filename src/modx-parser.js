// src/modx-parser.js
export function buildAliasMap(resources) {
  const map = {};
  resources.forEach(r => map[r.id] = r.alias);
  return map;
}

export function buildSlug(resource, aliasMap, allResources) {
  if (resource.uri && resource.uri !== '') {
    return resource.uri;
  }
  const parts = [];
  let current = resource;
  while (current.parent !== 0) {
    parts.unshift(aliasMap[current.parent] || '');
    current = allResources.find(r => r.id === current.parent) || { parent: 0 };
  }
  parts.push(resource.alias);
  return '/' + parts.filter(p => p).join('/');
}

export function parseResources(resources, aliasMap, allResources) {
  return resources.map(res => ({
    ...res,
    slug: buildSlug(res, aliasMap, allResources),
  }));
}