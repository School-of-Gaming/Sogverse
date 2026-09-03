// Next looks for a PostCSS config in the directory it is given, which is this
// one (`next dev demo`), not the package root.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
