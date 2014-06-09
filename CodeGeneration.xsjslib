var Utils = $.import("sap.hana.im.services.internal.util.generator", "Utils");
var Map = Utils.Map;
var Repo = $.import("sap.hana.im.services.internal.util", "HANARepositoryHelper");


/** Template language elements*/
function Condition(conditionStr, nodes, alternateNodes, variables, alternateVariables){
	this.conditionStr = conditionStr;
	this.nodes = nodes;
	this.alternateNodes = alternateNodes;
	this.variables = variables;
	this.alternateVariables = alternateVariables; 
	this.generate = function(context){
		var code = "";
		
		// process the condition - replace parameters
		var conditionStr = process(this.conditionStr, context);
		
		var fn = function(node){
			return node.generate(context);
		};

		// evaluate the condition
		var conditionResult = eval(conditionStr);
		if (conditionResult){
			//add local variables to the context
			context.pushLocal(this.variables);
			var nodes = this.nodes;
			code = Utils.formatArray(nodes, "\n", fn);
			context.popLocal();
		}
		else{
			if (this.alternateNodes != undefined){
				//add local variables to the context
				context.pushLocal(this.alternateVariables);
				var alternateNodes = this.alternateNodes;
				code = Utils.formatArray(alternateNodes, "\n", fn);
				context.popLocal();
			}
		}
							
		return code;
	};
};

function Loop(domainTerm, iterator, nodes, variables){
	this.domainTerm = domainTerm;
	this.iterator = iterator;
	this.nodes = nodes;
	this.variables = variables;
	this.generate = function(context){
		//add local variables to the context
		context.pushLocal(this.variables);
		
		var code = "";
		
		var nodes = this.nodes;
		var iterator = this.iterator;
		var domainValues = evaluate(this.domainTerm, context);
		var indexedDomainValues = [];
		for (var i=0; i < domainValues.length; i++){
			indexedDomainValues.push({"domainValue" : domainValues[i], "index" : i+1});
		}
		var fn = function(indexedDomainValue){
			context.put(iterator, indexedDomainValue.domainValue);
			context.put("tkCount", indexedDomainValue.index);
			return Utils.formatArray(nodes, "\n", function(node){return node.generate(context);});
		};
		
		code = Utils.formatArray(indexedDomainValues, "\n", fn);
		context.popLocal();
		return code;
	};
};

function Statement(pattern){
	this.pattern = pattern;
	this.generate = function(context){return process(this.pattern, context);};
};

/*** Prototype definitions ***/
function Generator(){
	this.generateFromFile = function(context, templatePackage, template){
		var templateCode = getTemplate(templatePackage, template);
		return this.generate(context, templateCode);
	};
	this.generate = function(context, templateCode){
		var root = parse(context, templateCode);
		var code = "";
		//add global variables to context
		context.add(root.variables);
		var fn = function(node){return node.generate(context);};

		code = Utils.formatArray(root.nodes, "\n", fn);	
		return code;
	};
};	
	
function GenerationContext(){
	this.map = new Map();
	this.entries = this.map.entries;
	this.localScopeInternal = [];
	/** @return the local scope variable sets in the correct order*/
	this.localScope = function(){
		var resArray = [].concat(this.localScopeInternal);
		return resArray.reverse();
	};
	this.put = function(key, value){
		this.map.put(key, value);
	};
	/** @return the value of the provided key, or the null if not found in the context */
	this.get = function(key) {
		return this.map.get(key);
	};
	this.addPairs = function(keyValueArray){
		for (var i=0; i < keyValueArray.length; i++){
			this.put(keyValueArray[i].key, keyValueArray[i].value);
		}
	};
	this.add = function(map){
		for (var i=0; i < map.entries.length; i++){
			this.put(map.entries[i].key, map.entries[i].value);
		}
	};
	
	this.pushLocal = function(map){
		this.localScopeInternal.push(map);
	};
	this.popLocal = function(){
		return this.localScopeInternal.pop();
	};
};		

function Index(){
	this.value = 0;
	this.increment = function(){this.value++;};
};

function parse(context, template){
	var lines = template.split("\n");
	var cleanedLines = removeTemplateComments(lines);
	var res = parseLinesRec(context, cleanedLines, new Index());
	var root = {"nodes" : res.nodes, "variables" : res.variables};
	return root;
};

function parseLinesRec(context, lines, index){
	var nodes = [];
	var variables = new Map();
	
	var possibleBlanks = '\\s*';
	var mandatoryBlanks = '\\s+';
	
	var singleWordIdnetifierPattern = '\\$\\{(\\w+)\\}';
	var complexIdentifierPattern = '\\$\\{(\\w+(\\.\\w+(\\(\\w*\\))?)*)\\}';
	
	var loopHeaderPattern = new RegExp('#foreach'+possibleBlanks+'\\('+possibleBlanks+singleWordIdnetifierPattern+mandatoryBlanks+'in'+mandatoryBlanks+complexIdentifierPattern+possibleBlanks+'\\)');
	var controlFooterPattern = new RegExp('#end');
	var conditionHeaderPattern = new RegExp('#if'+possibleBlanks+'\\('+possibleBlanks+'(.+)'+possibleBlanks+'\\)');
	var elsePattern = new RegExp(possibleBlanks+'#else' + possibleBlanks);
	var setPattern = new RegExp('#set'+possibleBlanks+'\\('+possibleBlanks+singleWordIdnetifierPattern+possibleBlanks+'='+possibleBlanks+'(.+)'+possibleBlanks+'\\)');
	
	while (index.value < lines.length){
		var line = lines[index.value];
		
		if (setPattern.exec(line)){ // a variable definition found
			index.increment();
			var matchResult = line.match(setPattern);
			
			variables.put(matchResult[1], matchResult[2]);
		}
		else if (conditionHeaderPattern.exec(line)){ // condition found
			index.increment();
			//Getting back from here will provide the positive flow statements and the negative flow (if any)
			var res = parseLinesRec(context, lines, index);
			var matchResult = line.match(conditionHeaderPattern);
			var conditionText = matchResult[1];
			var condition = new Condition(conditionText, res.nodes, res.alternateFlowNodes, res.variables, res.alternateFlowVariables);
			
			nodes.push(condition);
		}
		else if (elsePattern.exec(line)){ //else related to a condition found
			index.increment();
			var res = parseLinesRec(context, lines, index);
			
			//The else recursive will fold due to the controlFooterPattern. 
			//Then, must fold the condition recursive to avoid referring a non related another controlFooterPattern, or messing up the template entirely
			return {"nodes" : nodes, "alternateFlowNodes" : res.nodes, "variables" : variables, "alternateFlowVariables" : res.variables};
		}
		else if (loopHeaderPattern.exec(line)){ //loop found
			index.increment();
			var res = parseLinesRec(context, lines, index);
			var matchResult = line.match(loopHeaderPattern);
			var iterator = matchResult[1];
			var domainTerm = matchResult[2];
			var loop = new Loop(domainTerm, iterator, res.nodes, res.variables); 
			
			nodes.push(loop);
		}
		else if (controlFooterPattern.exec(line)){ //control flow ends
			index.increment();
			break;
		}
		else{ //"regular" statement
			var statement = new Statement(line);
			nodes = nodes.concat(statement);
			index.increment();
		}
	}
	return {"nodes" : nodes, "variables" : variables};
};

/** Helper methods */
			
/**
 * Remove sinlge line style comments  (##......) from the provided template text line
 * @param line - String
 * */
function removeSingleLineComment(templateLine){
	var cleanedLine = templateLine;
	var commentIdx = templateLine.indexOf('##');
	if (commentIdx >= 0){
		cleanedLine = templateLine.slice(0, commentIdx);
	}
	return cleanedLine;
};			
			
/**
 * Remove multiline styled comments (#*...*#) from the provided template text lines
 * @param templateLines - Array of template lines (String elements)
 * @return an Array of template lines (String) excluding the comments  
 * */
function removeTemplateComments(templateLines){
	var multiLineCommentStrtMark = '#*'; 
	var multiLineCommentEndMark = '*#';
	var removeMultiLineCommentInSingleLine = function(singleLine){
		var multiLineCommentStrtMarkRegexp = '#\\*';
		var multiLineCommentEndMarkRegexp = '\\*#';
		return singleLine.replace(
				new RegExp(multiLineCommentStrtMarkRegexp + ".*?" + multiLineCommentEndMarkRegexp,'g'), "");
	};
	var inComment = false;
	var lines = [];
	
	for (var i=0; i < templateLines.length; i++){
		var templateLine = templateLines[i];
		
		if (inComment){ //comment opened somewhere before
			var commentEndIdx = templateLine.indexOf(multiLineCommentEndMark);
			
			if (commentEndIdx >=0){ //current comment ends in this line
				//remove the remains of the comment (started in some line before)
				templateLine = templateLine.slice(commentEndIdx + multiLineCommentEndMark.length, templateLine.length);
				//remove single line comments
				templateLine = removeMultiLineCommentInSingleLine(templateLine); 
				templateLine = removeSingleLineComment(templateLine);
				var cleanedLine = "";
				var commentStrtIdx = templateLine.indexOf(multiLineCommentStrtMark);
				
				if (commentStrtIdx >= 0) {//another comment starts here
					cleanedLine = templateLine.slice(0, commentStrtIdx);
				}
				else{//no new comment starts in this line
					cleanedLine = templateLine;
					inComment = false;
				}
				if (cleanedLine.length > 0 ){//line contains non-comment data
					lines.push(cleanedLine);
				}
			}
			//else continue
		}
		else { // not in comment
			// start by removing "single line" comment
			templateLine = removeMultiLineCommentInSingleLine(templateLine); 
			templateLine = removeSingleLineComment(templateLine);
			var cleanedLine = "";
			var commentStrtIdx = templateLine.indexOf(multiLineCommentStrtMark);
			
			if (commentStrtIdx >= 0){ //detected new comment
				cleanedLine = templateLine.slice(0, commentStrtIdx);
				inComment = true;								
			}
			else{ //no comment in this line
				cleanedLine	= templateLine;
			}
			if (cleanedLine.length > 0 ){//line contains non-comment data
				lines.push(cleanedLine);
			}
		}
	}
	return lines;
};		


/**
* Evaluate a term from the give context. 
* A term can be a single word for a simple replacement, or a complex method/attribute call chain on some given object
* @param term - String, the term to evaluate
* @param Context - the context to evaluate the term out of.
* </br>Should correspond to the following contract:
* </br>{....get : function(key){.... return value;}....}
* @return the evaluation of the term in can be evaluated by the provided context, or null otherwise
*/
function evaluate(term, context){
	//1. if the key is of the pattern of replacement: ${text_without_separating_dot} - do replace
	var simpleReplacePattern = new RegExp('^(\\w+)$', 'g');//${.....}
	//2. if the key is of the obj properties pattern: ${some_object[.property|function()]+} - do evaluation of the expression, and replace with the evaluation result
	var complexEvaluationPattern = new RegExp('^\\w+(\\.\\w+(\\(\\w*\\))?)+$', 'g');//${..}
	var res = null;

	if (term.match(simpleReplacePattern)){
		res = context.get(term);
	}
	//else
	else if (term.match(complexEvaluationPattern)){
		//var objSeparatorIdx = term.indexOf('.');
		var objectTerm = term.slice(0, term.indexOf('.'));
		var obj = context.get(objectTerm);
		if (obj != null){ //found
			term = term.replace(objectTerm, 'obj'); //apply the call chain on the obj variable, instead of the name provided in the context 
			res = eval(term);
		}
	}
	return res;
};

/**
* Replace in text all occurrences of the keyValuePair.key with keyValuePair.value
* @param text - String
* @param keyValuePair - Object that should be of the structure {"key" : ??, "value" : ??}
*/
function replaceVariable (text, keyValuePair){
		var pattern = '\\$\\{' + keyValuePair.key + '\\}';
		return text.replace(new RegExp(pattern, 'g'), keyValuePair.value);					
};

function replaceTerm (text, term, value){
	var pattern = '\\$\\{' + term + '\\}';
	return text.replace(new RegExp(pattern, 'g'), value);					
};

function extractTerms(text){
	var identifierPattern = new RegExp('\\$\\{(\\w+(\\.\\w+(\\(\\w*\\))?)*)\\}', 'g');
	var results = text.match(identifierPattern);
	var terms = [];
	if (results != undefined){
		for (var termIdx=0; termIdx < results.length; termIdx++){
			var res = results[termIdx];
			var term = res.slice(/*0+*/'${'.length, res.indexOf('}'));
			terms.push(term);
		}
	}
	return terms;
};

/**
 * Manipulate a line, replacing variables with the correct values
 * @param line - String
 * @param context - GenerationContext
 * */
function process(line, context){
	var processedLine = line;
	var terms = extractTerms(line);

	
	//first pass is with all the local scope variables, where the order is from the last to be insert up to the first one,
	//To make sure overridden values are applied					
	var localScope = context.localScope();
	
	for (var locIdx=0; locIdx < localScope.length; locIdx++){
		var localVariables = localScope[locIdx];
		
		for (var termIdx=0; termIdx < terms.length; termIdx++){	
			var term = terms[termIdx];
			var termValue = evaluate(term, localVariables);
			if (termValue != null){ //proceed only if a value was found
				processedLine = replaceTerm(processedLine, term, termValue);
			}
		}
	}
	
	//second pass is with the global scope, completing values that were not defined localy
	terms = extractTerms(processedLine);
	for (var termIdx=0; termIdx < terms.length; termIdx++){
		var term = terms[termIdx];
		var termValue = evaluate(term, context);
		if (termValue != null){ //proceed only if a value was found
			processedLine = replaceTerm(processedLine, term, termValue);
		}
	}
	return processedLine;
};

/**
 * Read a template code from the dedicated location of code templates in the HANA repository
 * @param templatePackage - String - the package in hte HANA repository that contains the template file
 * @param templateName - String - the template file name 
 * */
function getTemplate(templatePackage, templateFileName){

	//split the file name to name and suffix
	//we consider here an option that the file name may contain more than a single '.', like "file.name.suffix" 
	var suffixSeparator = templateFileName.lastIndexOf(".");
	var fileName = templateFileName.substring(0, suffixSeparator);
	var templateSuffix = templateFileName.substring(suffixSeparator + 1);
	
	//read the tmeplate object
	var object = Repo.readObject(templatePackage, fileName, templateSuffix);
	var templateContent = object.bdata;
	
	//it is stored as bytes and not characters  - convert
	var text = String.fromCharCode.apply(null, new Uint8Array(templateContent));
		
	return text;
};
