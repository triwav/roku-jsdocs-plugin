'use strict';
const brs = require('brs');
const path = require('path');

exports.handlers = {
	beforeParse(e) {
		let getLineNumber = function (sourceString, index) {
			return sourceString.substr(0, index).split('\n').length
		}

		let getTypeName = function (type) {
			return brs.types.ValueKind.toString(type);
		}

		let parserLines = e.source.split('\n');
		let lexResult = brs.lexer.Lexer.scan(e.source);
		let parser = new brs.parser.Parser();
		let parseResult = parser.parse(lexResult.tokens);
		let statements = parseResult.statements

		// Remove any leading Brightscript comment
		let source = e.source.replace(/[ \t]*('|REM)[ \t]+?(\/?\*.*)/g, '$2');

		let statement, functions = [];
		while (statement = statements.shift()) {
			if (statement instanceof brs.parser.Stmt.Function) {
				functions.push(statement);
			}
		}

		let commentsRegex = /\/\*\*[\s\S]+?\*\//g
		let result, comments = [];
		while (result = commentsRegex.exec(source)) {
			comments.push({
				'startLine': getLineNumber(result.input, result.index),
				'endLine': getLineNumber(result.input, result.index + result[0].length),
				'text': result[0]
			})
		}

		if (comments.length === 0 && functions.length === 0) {
			e.source = '';
			return;
		}

		// Add our module to the top of the file if it doesn't exist. If it does find out the name
		let moduleMatch = source.match(/@module ([^\*\s]+)/);
		let moduleName;
		let output = [];
		if (moduleMatch) {
			moduleName = moduleMatch[1];
		} else {
			moduleName = path.parse(e.filename).name.replace(/\./g, '_');
			output.push(`/** @module ${moduleName} */`);
		}

		while (comments.length > 0 || functions.length > 0) {
			let comment;
			let functionStartLine = Number.MAX_SAFE_INTEGER
			if (functions[0]) functionStartLine = functions[0].func.keyword.location.start.line;
			if (comments[0] && comments[0].endLine < functionStartLine) {
				comment = comments.shift();
			}

			if (comment && (!functions[0] || comment.endLine + 1 !== functionStartLine)) {
				output.push(comment.text);
			} else {
				let func = functions.shift();
				if (!func) continue;

				let commentLines = ['/**'];
				if (comment) commentLines = comment.text.split('*/')[0].split('\n');

				let paramRegex = /@param (?:{([^}]*)} )?(\w+)[\s-\s|\s]*(.*)/
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
						let start = param.defaultValue.location.start;
						let end = param.defaultValue.location.end;
						let defaultValue = parserLines[start.line - 1].slice(start.column, end.column);
						paramLine += `[${paramName}=${defaultValue}]`
					} else {
						paramLine += paramName;
					}
					if (paramDescription) paramLine += ` - ${paramDescription}`;
					commentLines.push(paramLine);
				}
				if (func.name.text[0] === '_') commentLines.push(' * @access private');
				commentLines.push(` * @return {${getTypeName(func.func.returns)}}`);
				commentLines.push(` * @memberof module:${moduleName}`);
				commentLines.push(' */');
				output.push(commentLines.join('\n'));
				output.push(`function ${func.name.text}() {};\n`);
			}
		}
		e.source = output.join('\n');
	}
};
