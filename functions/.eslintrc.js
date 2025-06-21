module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: [
    "eslint:recommended"
  ],
  rules: {
    quotes: ["error", "double"],
    "max-len": ["error", { "code": 120 }],
    "no-unused-vars": "off",
    "comma-dangle": ["error", "only-multiline"],
    "object-curly-spacing": ["error", "always"]
  }
};
