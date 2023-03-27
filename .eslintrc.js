/* eslint-env node */
module.exports = {
  "env": {
    "browser": true,
    "es6": true,
    "node": true
  },
  "globals": {
    "atom": "writeable"
  },
  "plugins": [
    // "unicorn"
  ],
  "extends": "eslint:recommended",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true,
      "modules": true
    }
  },
  "rules": {
    "indent": [
      "error",
      2,
      {
        "SwitchCase": 1
      }
    ],
    "linebreak-style": [
      "error",
      "unix"
    ],
    "semi": [
      "error",
      "always"
    ],
    "space-before-function-paren": ["error", "always"],
    "no-useless-escape": "off",
    "no-cond-assign": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    // "no-console": [
    //   "warn",
    //   {
    //     "allow": ["debug", "error"]
    //   }
    // ],
  }
};
