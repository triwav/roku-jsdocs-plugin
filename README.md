# What is this?

Plugin For JSDoc that converts Brighterscript files into comments compatible with JSDoc. Automatically pulls in function/sub name and param and return types. Can be overridden with more info as desired (description, param type override or param description). Automatically bases module off of file name but can be changed and used to combine multiple files into one module. Module is automatically applied to each sub/function in that file

# How To View Example Docs

```
git clone https://github.com/markwpearce/brighterscript-jsdocs-plugin.git
cd brighterscript-jsdocs-plugin
npm install
npm run docs
```

Docs are output in docs folder.

# Installation

```
npm install markwpearce/brighterscript-jsdocs-plugin --save-dev
```

Add a script to `package.json` like:

```json
  "scripts": {
    "docs": "./node_modules/.bin/jsdoc -c j./node_modules/brighterscript-jsdocs-plugin/jsdoc.json -t -d docs"
  }
```
