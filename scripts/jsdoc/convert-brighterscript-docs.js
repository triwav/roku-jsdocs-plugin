'use strict';
const bs = require('brighterscript');
const path = require('path');
const { connected } = require('process');


const jsCommentStartRegex = /^[\s]*(?:\/\*+)?[\s]*(.*)/g
const bsMeaningfulCommentRegex = /^[\s]*(?:'|REM)[\s]*\**[\s]*(.*)/g
const paramRegex = /@param (?:{([^}]*)} )?(\w+)[\s-\s|\s]*(.*)/
const returnRegex = /@returns?\s*(?:{(?:[^}]*)})?\s*(.*)/
const extendsRegex = /@extends/

/** @type {string[]} */
let parserLines

/**
 * Groups Statements into comments, functions, classes and namespaces
 *
 * @param {bs.Statement[]} statements
 * @returns
 */
function groupStatements(statements) {
  /** @type{bs.CommentStatement[]} */
  const comments = []
  /** @type{bs.FunctionStatement[]} */
  const functions = []
  /** @type{bs.ClassStatement[]} */
  const classes = []
  /** @type{bs.NamespaceStatement[]} */
  const namespaces = []

  statements.forEach(statement => {
    if (statement instanceof bs.CommentStatement) {
      comments.push(statement)
    }
    if (statement instanceof bs.FunctionStatement) {
      functions.push(statement);
    }
    if (statement instanceof bs.ClassStatement) {
      classes.push(statement);
    }
    if (statement instanceof bs.NamespaceStatement) {
      namespaces.push(statement);
    }
  });
  return { comments, functions, classes, namespaces }
}



/**
 * getTypeName
 *
 * @param {number | {kind:text}} type id
 * @returns {string} the name for the type id given
 */
function getTypeName(type) {
  if (!type) {
    return "dynamic"
  }
  if (type.text) {
    return type.text
  }
  const valueKind = bs.ValueKind[type]
  if (valueKind) {
    return valueKind.toString();
  }
  return "dynamic"
}

/**
 *
 * @param {bs.CommentStatement[]} comments
 * @param {bs.Statement} stmt
 * @returns {bs.CommentStatement}
 */
function getCommentForStatement(comments, stmt) {
  return comments.find((comment) => {
    return comment.range.end.line + 1 === stmt.range.start.line
  })
}

function getMemberOf(moduleName = "", namespaceName = "") {
  if (namespaceName) {
    return (" * @memberof module:" + namespaceName)
  }
  if (moduleName) {
    return (` * @memberof module:${moduleName}`);
  }
  return ""

}

/**
 * convertCommentTextToJsDocLines
 *
 * @param {bs.CommentStatement} comment
 * @returns {string[]}
 */
function convertCommentTextToJsDocLines(comment) {
  const commentLines = ['/**'];
  if (comment && comment.text) {
    // Replace brighterscript comment format with jsdoc - eg.
    //   '  Comment here
    // to
    //  * Comment here
    commentLines.push(...comment.text.split('\n').map((line, i) => {
      return line.replace(bsMeaningfulCommentRegex, '$1');
    }).map(line => line.trim()).map((line, i, lines) => {
      if (i === 0) {
        line = line.replace(jsCommentStartRegex, '$1');
      }
      line = line.replace(/\**\/\s*/g, "")
      return " * " + line;
    }))
  }
  return commentLines
}
/**
 *
 *
 * @param {bs.Statement} stmt
 * @returns {void}
 */
function displayStatement(stmt) {
  if (stmt instanceof bs.CommentStatement) {
    console.log(`Comment`)
  }
  else if (stmt instanceof bs.FunctionStatement) {
    console.log(`Function`)
  }
  else if (stmt instanceof bs.ClassStatement) {
    console.log(`Class`)
  }
  else if (stmt instanceof bs.NamespaceStatement) {
    console.log(`Namespace`)
  }
  else if (stmt instanceof bs.ClassMethodStatement) {
    console.log(`Method`)
  }
  else if (stmt.constructor) {
    console.log(`${stmt.constructor.toString()}`)
  }
  if (stmt.text) {
    console.log(stmt.text)
  }
  console.log(`Range:`, stmt.range)
}

/**
 * processFunction
 *
 * @param {bs.CommentStatement} comment
 * @param {bs.ClassMethodStatement} func
 * @param {string} moduleName
 * @param {string} namespaceName
 * @returns {string}
 */
function processFunction(comment, func, moduleName = "", namespaceName = "") {
  const output = []
  let commentLines = convertCommentTextToJsDocLines(comment);

  // Find the param line in the comments that match each param
  for (const param of func.func.parameters) {
    let paramName = param.name.text;
    let paramType = getTypeName(param.type.kind);
    let paramDescription;
    for (var i = 0; i < commentLines.length; i++) {
      let commentMatch = commentLines[i].match(paramRegex);
      if (commentMatch && paramName === commentMatch[2]) {
        if (commentMatch[1]) paramType = commentMatch[1];
        paramDescription = commentMatch[3];
        commentLines.splice(i, 1);
        i--;
        break;
      }
    }

    let paramLine = ` * @param {${paramType}} `
    if (param.defaultValue) {
      let start = param.defaultValue.range.start;
      let end = param.defaultValue.range.end;
      let defaultValue = parserLines[start.line - 1].slice(start.character, end.character);
      paramLine += `[${paramName}=${defaultValue}]`
    } else {
      paramLine += paramName;
    }
    if (paramDescription) paramLine += ` - ${paramDescription}`;
    commentLines.push(paramLine);
  }
  if (func.name.text[0] === '_' || func.accessModifier === "Private") {
    commentLines.push(' * @access private');
  }

  let returnLine = ` * @return {${getTypeName(func.func.returns)}}`
  // Find the return line in the comments
  for (var i = 0; i < commentLines.length; i++) {
    let commentMatch = commentLines[i].match(returnRegex);
    if (commentMatch && commentMatch[1]) {
      returnLine = ` * @return {${getTypeName(func.func.returns)}} - ${commentMatch[1]}`;

      commentLines.splice(i, 1);
      break;
    }
  }

  commentLines.push(returnLine);
  commentLines.push(getMemberOf(moduleName, namespaceName));

  if (func.overrides) {
    commentLines.push(` * @override`);
  }

  const funcName = func.name.text
  let funcDeclaration = `function ${funcName}() {};\n`
  if (func instanceof bs.ClassMethodStatement) {
    if (funcName === "new") {
      commentLines.push(" * @constructor")
      funcDeclaration = `constructor() {};\n`

    }
    else {
      funcDeclaration = `${funcName}() {};\n`

    }
  }
  commentLines.push(' */');
  output.push(commentLines.join('\n'));

  output.push(funcDeclaration);
  if (namespaceName) {
    output.push(`${namespaceName}.${funcName} = ${funcName};`)
  }

  return output.join('\n')
}

/**
 * processClassField
 *
 * @param {bs.CommentStatement} comment
 * @param {bs.ClassFieldStatement} field
 * @returns {string}
 */
function processClassField(comment, field) {
  const output = []
  if (field.accessModifier && func.accessModifier === "Private") {
    return ""
  }
  let description = "";
  if (comment) {
    description = comment.text.replace(bsMeaningfulCommentRegex, '$1');
  }
  output.push(` * @property {${getTypeName(field.type)}} ${field.name.text} ${description}`)

  return output.join('\n')
}


/**
 * processClass
 *
 * @param {bs.CommentStatement} comment
 * @param {bs.ClassStatement} klass
 * @param {string} moduleName
 * @param {string} namespaceName [namespaceName=""]
 * @returns
 */
function processClass(comment, klass, moduleName = "", namespaceName = "") {
  const output = []

  let commentLines = convertCommentTextToJsDocLines(comment);
  const klassCode = groupStatements(klass.body)


  let parentClassName = "", extendsLine = ""
  if (klass.parentClassName) {
    parentClassName = klass.parentClassName.getName()
    extendsLine = ` * @extends ${klass.parentClassName.getName()}`
  }

  for (var i = 0; i < commentLines.length; i++) {
    let commentMatch = commentLines[i].match(extendsRegex);
    if (commentMatch && commentMatch[1]) {
      commentLines.splice(i, 1);
      break;
    }
  }
  if (extendsLine) {
    commentLines.push(extendsLine);
  }
  // get properties
  commentLines.push(getMemberOf(moduleName, namespaceName));
  klass.fields.forEach(field => {
    const fieldComment = getCommentForStatement(klassCode.comments, field)
    commentLines.push(processClassField(fieldComment, field))
  });

  commentLines.push(' */');
  output.push(commentLines.join('\n'));

  const klassName = klass.name.text
  if (parentClassName) {
    output.push(`class ${klassName} extends ${parentClassName} {\n`);
  }
  else {
    output.push(`class ${klassName} {\n`);
  }

  klass.methods.forEach(method => {
    const methodComment = getCommentForStatement(klassCode.comments, method)
    output.push(processFunction(methodComment, method))
  })

  output.push('}\n')
  if (namespaceName) {
    output.push(`${namespaceName}.${klassName} = ${klassName};`)
  }
  return output.join('\n')
}

/**
 * processNamespace
 *
 * @param {bs.CommentStatement} comment
 * @param {bs.NamespaceStatement} namespace
 * @param {string} moduleName [moduleName=""]
 * @param {string} parentNamespaceName [parentNamespaceName=""]
 */
function processNamespace(comment, namespace, moduleName = "", parentNamespaceName) {

  const output = [];
  let namespaceName = namespace.name;

  if (parentNamespaceName) {
    namespaceName = parentNamespaceName + "." + namespaceName
  }

  let commentLines = convertCommentTextToJsDocLines(comment);

  commentLines.push(getMemberOf(moduleName, parentNamespaceName));
  commentLines.push(` * @namespace ${namespaceName}`)
  commentLines.push(' */');

  output.push(commentLines.join('\n'));
  if (parentNamespaceName) {
    output.push(`${parentNamespaceName}.namespaceName = {}`)
  }
  else {
    output.push(`var ${namespaceName} = {};`);
  }


  output.push(processStatements(namespace.body.statements, moduleName, namespaceName))
  return output.join('\n');
}



/**
 * processStatements
 *
 * @param {bs.Statement[]} statements
 * @param {string} [moduleName=""]
 * @param {string} namespaceName [namespaceName=""]
 * @returns
 */
function processStatements(statements, moduleName = "", namespaceName = "") {

  const output = [];
  const code = groupStatements(statements)

  if (code.comments.length === 0 && code.functions.length === 0 && code.classes.length === 0 && code.namespaces.length === 0) {
    return '';
  }

  code.functions.forEach(func => {
    const comment = getCommentForStatement(code.comments, func)
    const functionOutput = processFunction(comment, func, moduleName, namespaceName)
    output.push(functionOutput);
  });
  code.classes.forEach(klass => {
    const comment = getCommentForStatement(code.comments, klass)
    const classOutput = processClass(comment, klass, moduleName, namespaceName)
    output.push(classOutput);
  });

  code.namespaces.forEach(namespace => {
    const comment = getCommentForStatement(code.comments, namespace)
    const namespaceOutput = processNamespace(comment, namespace, moduleName, namespaceName)
    output.push(namespaceOutput);
  });
  return output.join('\n');
}


exports.handlers = {
  beforeParse(e) {

    parserLines = e.source.split('\n');
    const lexResult = bs.Lexer.scan(e.source);
    const parser = new bs.Parser();
    const parseResult = parser.parse(lexResult.tokens);
    const statements = parseResult.statements

    // Remove any leading Brightscript comment
    let source = e.source.replace(bsMeaningfulCommentRegex, '$2');

    // Add our module to the top of the file if it doesn't exist. If it does find out the name
    const moduleMatch = source.match(/@module ([^\*\s]+)/);
    let moduleName = "";
    const output = [];
    if (moduleMatch) {
      moduleName = moduleMatch[1];
    } else {
      moduleName = path.parse(e.filename).name.replace(/\./g, '_');
      output.push(`/** @module ${moduleName} */`);
    }
    output.push(processStatements(statements, moduleName))


    e.source = output.join('\n');

    //console.log(e.source)
  }
};
