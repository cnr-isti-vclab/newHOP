export const distributionManifest = {
  files: [
    { source: 'LICENSE', destination: 'LICENSE' },
    { source: 'docs/authoring/README.md', destination: 'README.md' },
    { source: 'docs/authoring/distribution-index.html', destination: 'index.html' }
  ],
  directories: [
    { source: 'dist', destination: 'dist' },
    { source: 'examples', destination: 'examples' },
    { source: 'docs/authoring', destination: 'docs', exclude: ['README.md', 'AGENTS.md', 'distribution-index.html'] }
  ]
};
