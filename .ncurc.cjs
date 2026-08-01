module.exports = {
  // typescript 7 dropped the JavaScript Compiler API that vite-plugin-dts
  // (unplugin-dts) requires, so stay within the current major.
  target: (name) => (name === 'typescript' ? 'minor' : 'latest')
};
