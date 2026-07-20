module.exports = function (source) {
  const nameMatch = source.match(/\/\*\s*Name:\s*(.+?)\s*\*\//);
  const filename = this.resourcePath.split('/').pop().replace(/\.css$/, '');
  const name = nameMatch
    ? nameMatch[1].trim()
    : filename
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
  const dark = /html\.pf-v6-theme-dark\[data-theme/.test(source);
  return `export default ${JSON.stringify({ name, dark })};`;
};
