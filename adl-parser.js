/**
 * OpenEHR ADL (Archetype Definition Language) Parser
 * Parses ADL 1.4 format files and extracts structure for form generation
 */

class ADLParser {
    constructor() {
        this.archetype = null;
        this.rawContent = '';
    }

    /**
     * Parse an ADL file content
     * @param {string} content - The raw ADL file content
     * @returns {object} Parsed archetype structure
     */
    parse(content) {
        this.rawContent = content;
        this.archetype = {
            id: '',
            concept: '',
            originalLanguage: 'en',
            availableLanguages: [],
            description: {},
            definition: {
                dataFields: [],
                stateFields: [],
                protocolFields: [],
                allFields: []
            },
            ontology: {}
        };

        try {
            this.parseHeader();
            this.parseLanguages();
            this.parseDescription();
            this.parseDefinition();
            this.parseOntology();
            this.resolveTerms();
        } catch (error) {
            console.error('Error parsing ADL:', error);
            throw new Error('Failed to parse ADL file: ' + error.message);
        }

        return this.archetype;
    }

    /**
     * Parse the archetype header (ID and concept)
     */
    parseHeader() {
        // Extract archetype ID
        const idMatch = this.rawContent.match(/archetype\s*\([^)]+\)\s*\n\s*([^\s]+)/);
        if (idMatch) {
            this.archetype.id = idMatch[1].trim();
        }

        // Extract concept code
        const conceptMatch = this.rawContent.match(/concept\s*\n\s*\[([^\]]+)\]/);
        if (conceptMatch) {
            this.archetype.concept = conceptMatch[1];
        }
    }

    /**
     * Parse available languages
     */
    parseLanguages() {
        // Original language
        const origLangMatch = this.rawContent.match(/original_language\s*=\s*<\[ISO_639-1::([^\]]+)\]>/);
        if (origLangMatch) {
            this.archetype.originalLanguage = origLangMatch[1];
            this.archetype.availableLanguages.push(origLangMatch[1]);
        }

        // Find all translations
        const translationsSection = this.extractSection('translations');
        if (translationsSection) {
            const langMatches = translationsSection.matchAll(/\["([a-z]{2}(?:-[a-z]{2})?)"\]\s*=\s*</gi);
            for (const match of langMatches) {
                if (!this.archetype.availableLanguages.includes(match[1])) {
                    this.archetype.availableLanguages.push(match[1]);
                }
            }
        }
    }

    /**
     * Parse description section
     */
    parseDescription() {
        const descSection = this.extractSection('description');
        if (!descSection) return;

        // Parse details for each language
        const detailsMatch = descSection.match(/details\s*=\s*<([\s\S]*?)>\s*lifecycle_state/);
        if (detailsMatch) {
            const detailsContent = detailsMatch[1];
            
            // Extract purpose for each language
            const langBlocks = detailsContent.matchAll(/\["([^"]+)"\]\s*=\s*<([\s\S]*?)(?=\["[a-z]|$)/gi);
            for (const block of langBlocks) {
                const lang = block[1];
                const content = block[2];
                
                this.archetype.description[lang] = {
                    purpose: this.extractValue(content, 'purpose'),
                    use: this.extractValue(content, 'use'),
                    misuse: this.extractValue(content, 'misuse'),
                    keywords: this.extractListValue(content, 'keywords')
                };
            }
        }
    }

    /**
     * Parse the definition section to extract all fields
     */
    parseDefinition() {
        const defSection = this.extractSection('definition');
        if (!defSection) return;

        // Parse data fields (main observation data)
        this.archetype.definition.dataFields = this.parseDataSection(defSection);
        
        // Parse state fields
        this.archetype.definition.stateFields = this.parseStateSection(defSection);
        
        // Parse protocol fields
        this.archetype.definition.protocolFields = this.parseProtocolSection(defSection);

        // Parse all fields in definition (generic fallback for any archetype)
        const allFields = this.parseAllFields(defSection);
        const existingCodes = new Set([
            ...this.archetype.definition.dataFields,
            ...this.archetype.definition.stateFields,
            ...this.archetype.definition.protocolFields
        ].map(f => f.code));
        this.archetype.definition.allFields = allFields.filter(f => !existingCodes.has(f.code));
    }

    /**
     * Parse all ELEMENTs and CLUSTER slots anywhere in definition
     * This supports COMPOSITION/CLUSTER archetypes that don't have data/state/protocol.
     */
    parseAllFields(defSection) {
        const fields = [];
        const seen = new Set();

        // Extract all ELEMENT definitions
        const elementRegex = /ELEMENT\[([^\]]+)\][^\n]*matches\s*\{/g;
        let match;
        while ((match = elementRegex.exec(defSection)) !== null) {
            const code = match[1];
            const startPos = match.index + match[0].length;
            const valueSpec = this.extractBalancedBraces(defSection, startPos);
            if (!valueSpec || seen.has(code)) continue;
            const field = this.parseElement(code, valueSpec);
            if (field) {
                fields.push(field);
                seen.add(code);
            }
        }

        // Extract CLUSTER slots (allow_archetype)
        const clusterRegex = /allow_archetype\s+CLUSTER\[([^\]]+)\][^\{]*matches\s*\{([\s\S]*?)\}/g;
        while ((match = clusterRegex.exec(defSection)) !== null) {
            const code = match[1];
            if (seen.has(code)) continue;
            const spec = match[2];
            fields.push({
                code: code,
                type: 'CLUSTER',
                constraints: {},
                archetypePattern: this.extractArchetypePattern(spec)
            });
            seen.add(code);
        }

        return fields;
    }

    /**
     * Parse data section elements
     */
    parseDataSection(defSection) {
        const fields = [];
        
        // Find ITEM_TREE within data section
        const dataTreeMatch = defSection.match(/data\s+matches\s*\{[\s\S]*?ITEM_TREE\[at0003\]\s*matches\s*\{[\s\S]*?items[\s\S]*?\{([\s\S]*?)\}\s*\}\s*\}/);
        if (dataTreeMatch) {
            const itemsContent = dataTreeMatch[1];
            this.extractElements(itemsContent, fields);
        }

        // Also look for elements directly in events
        const elementsRegex = /ELEMENT\[([^\]]+)\][^\{]*matches\s*\{([\s\S]*?)\}/g;
        let match;
        const processedCodes = new Set(fields.map(f => f.code));
        
        // Search in the broader data section
        const dataSection = defSection.match(/data\s+matches\s*\{([\s\S]*?)\}\s*(?:state|protocol|$)/i);
        if (dataSection) {
            while ((match = elementsRegex.exec(dataSection[1])) !== null) {
                const code = match[1];
                if (!processedCodes.has(code)) {
                    const valueSpec = match[2];
                    const field = this.parseElement(code, valueSpec);
                    if (field) {
                        fields.push(field);
                        processedCodes.add(code);
                    }
                }
            }
        }

        return fields;
    }

    /**
     * Parse state section elements
     * State section contains patient position, confounding factors, etc.
     */
    parseStateSection(defSection) {
        const fields = [];
        
        // Find state section - it comes after data section inside events
        const stateStart = defSection.indexOf('state matches');
        if (stateStart === -1) return fields;
        
        // Get content from state matches to protocol section
        let stateEndIndex = defSection.indexOf('protocol matches');
        if (stateEndIndex === -1) stateEndIndex = defSection.length;
        
        let stateContent = defSection.substring(stateStart, stateEndIndex);
        
        // Find all ELEMENT definitions in state section
        // Match: ELEMENT[at0008] occurrences matches {0..1} matches {
        const elementRegex = /ELEMENT\[([^\]]+)\][^\n]*matches\s*\{/g;
        let match;
        
        while ((match = elementRegex.exec(stateContent)) !== null) {
            const code = match[1];
            const startPos = match.index + match[0].length;
            
            // Extract the full element content (everything until matching closing brace)
            const valueSpec = this.extractBalancedBraces(stateContent, startPos);
            if (valueSpec) {
                const field = this.parseElement(code, valueSpec);
                if (field) {
                    fields.push(field);
                }
            }
        }
        
        return fields;
    }

    /**
     * Parse protocol section elements
     * Protocol section contains method, device, cuff size, measurement location, etc.
     */
    parseProtocolSection(defSection) {
        const fields = [];
        
        // Find protocol section
        const protocolStart = defSection.indexOf('protocol matches');
        if (protocolStart === -1) return fields;
        
        // Get content from protocol matches to end of definition
        const protocolContent = defSection.substring(protocolStart);
        
        // Find all ELEMENT definitions in protocol section
        const elementRegex = /ELEMENT\[([^\]]+)\][^\n]*matches\s*\{/g;
        let match;
        
        while ((match = elementRegex.exec(protocolContent)) !== null) {
            const code = match[1];
            const startPos = match.index + match[0].length;
            
            // Extract the value specification for this element
            const valueSpec = this.extractBalancedBraces(protocolContent, startPos);
            if (valueSpec) {
                const field = this.parseElement(code, valueSpec);
                if (field) {
                    fields.push(field);
                }
            }
        }
        
        return fields;
    }
    
    /**
     * Extract content within balanced braces starting from a position
     */
    extractBalancedBraces(content, startPos) {
        let depth = 1;
        let pos = startPos;
        
        while (pos < content.length && depth > 0) {
            if (content[pos] === '{') depth++;
            else if (content[pos] === '}') depth--;
            pos++;
        }
        
        if (depth === 0) {
            return content.substring(startPos, pos - 1);
        }
        return null;
    }

    /**
     * Extract elements from an items section
     */
    extractElements(content, fields) {
        // Match ELEMENT definitions
        const elementRegex = /ELEMENT\[([^\]]+)\][^\{]*matches\s*\{([\s\S]*?)\}(?=\s*(?:ELEMENT|allow_archetype|CLUSTER|\}|$))/g;
        let match;
        
        while ((match = elementRegex.exec(content)) !== null) {
            const code = match[1];
            const valueSpec = match[2];
            const field = this.parseElement(code, valueSpec);
            if (field) {
                fields.push(field);
            }
        }

        // Match CLUSTER slots (allow_archetype)
        const clusterRegex = /allow_archetype\s+CLUSTER\[([^\]]+)\][^\{]*matches\s*\{([\s\S]*?)\}/g;
        while ((match = clusterRegex.exec(content)) !== null) {
            const code = match[1];
            const spec = match[2];
            fields.push({
                code: code,
                type: 'CLUSTER',
                archetypePattern: this.extractArchetypePattern(spec)
            });
        }
    }

    /**
     * Parse a single element definition
     * Detects type (QUANTITY, CODED_TEXT, TEXT, DURATION) and extracts constraints
     */
    parseElement(code, valueSpec) {
        const field = {
            code: code,
            type: 'TEXT',
            constraints: {}
        };

        // Check for quantity type (C_DV_QUANTITY)
        if (valueSpec.includes('C_DV_QUANTITY')) {
            field.type = 'QUANTITY';
            const unitsMatch = valueSpec.match(/units\s*=\s*<"([^"]+)">/);
            if (unitsMatch) {
                field.constraints.units = unitsMatch[1];
            }
            const magnitudeMatch = valueSpec.match(/magnitude\s*=\s*<\|([^|]+)\|>/);
            if (magnitudeMatch) {
                field.constraints.range = magnitudeMatch[1];
            }
            const precisionMatch = valueSpec.match(/precision\s*=\s*<\|([^|]+)\|>/);
            if (precisionMatch) {
                field.constraints.precision = parseInt(precisionMatch[1]);
            }
        }
        // Check for coded text with defined codes (DV_CODED_TEXT with local:: codes)
        else if (valueSpec.includes('DV_CODED_TEXT') && valueSpec.includes('local::')) {
            field.type = 'CODED_TEXT';
            // Extract codes from [local:: at1000, at1001, ...] pattern
            const codesMatch = valueSpec.match(/\[local::\s*([\s\S]*?)\]/);
            if (codesMatch) {
                // Parse codes, handling comments like "at1000,    -- Standing"
                const codesStr = codesMatch[1];
                const codesList = [];
                const codePattern = /(at\d+)/g;
                let codeMatch;
                while ((codeMatch = codePattern.exec(codesStr)) !== null) {
                    codesList.push(codeMatch[1]);
                }
                field.constraints.allowedCodes = codesList;
            }
        }
        // Check for coded text without specific codes
        else if (valueSpec.includes('DV_CODED_TEXT')) {
            field.type = 'CODED_TEXT';
            field.constraints.allowedCodes = [];
        }
        // Check for duration
        else if (valueSpec.includes('DV_DURATION')) {
            field.type = 'DURATION';
            const durationMatch = valueSpec.match(/value\s+matches\s*\{([^}]+)\}/);
            if (durationMatch) {
                field.constraints.pattern = durationMatch[1].trim();
            }
        }
        // Check for plain text (DV_TEXT)
        else if (valueSpec.includes('DV_TEXT')) {
            field.type = 'TEXT';
        }

        return field;
    }

    /**
     * Extract archetype pattern from allow_archetype
     */
    extractArchetypePattern(spec) {
        const patternMatch = spec.match(/archetype_id\/value\s+matches\s*\{\/([^\/]+)\//);
        return patternMatch ? patternMatch[1] : null;
    }

    /**
     * Parse the ontology section - extracts term definitions for all languages
     * This is critical for resolving codes like at0000 to "Blood pressure"
     */
    parseOntology() {
        // Find the ontology section - it starts with "ontology" and goes to end of file
        const ontologyStart = this.rawContent.indexOf('ontology');
        if (ontologyStart === -1) {
            console.error('No ontology section found in ADL file');
            return;
        }
        
        const ontologyContent = this.rawContent.substring(ontologyStart);
        
        // Find term_definitions section
        const termDefsStart = ontologyContent.indexOf('term_definitions');
        if (termDefsStart === -1) {
            console.error('No term_definitions found in ontology');
            return;
        }
        
        const termDefsContent = ontologyContent.substring(termDefsStart);
        
        // Find all language blocks: ["en"] = <, ["de"] = <, etc.
        // Pattern: ["lang"] = < ... items = < ... > ... >
        const langPattern = /\["([a-z]{2}(?:-[a-z]{2,3})?)"\]\s*=\s*<\s*items\s*=\s*</gi;
        let langMatch;
        
        const languagePositions = [];
        while ((langMatch = langPattern.exec(termDefsContent)) !== null) {
            languagePositions.push({
                lang: langMatch[1],
                startIndex: langMatch.index,
                itemsStart: langMatch.index + langMatch[0].length
            });
        }
        
        // Process each language block
        for (let i = 0; i < languagePositions.length; i++) {
            const langInfo = languagePositions[i];
            const lang = langInfo.lang;
            
            // Find the end of this language block (start of next language or end of term_definitions)
            let endIndex;
            if (i + 1 < languagePositions.length) {
                endIndex = languagePositions[i + 1].startIndex;
            } else {
                // Last language - find the end by counting angle brackets or use a large chunk
                endIndex = termDefsContent.length;
            }
            
            const itemsContent = termDefsContent.substring(langInfo.itemsStart, endIndex);
            
            this.archetype.ontology[lang] = {};
            this.parseTermItems(itemsContent, this.archetype.ontology[lang]);
            
            console.log(`Parsed ${Object.keys(this.archetype.ontology[lang]).length} terms for language: ${lang}`);
        }
    }

    /**
     * Parse term items from ontology content
     * Extracts: ["at0000"] = < text = <"Blood pressure"> description = <"..."> >
     */
    parseTermItems(content, target) {
        // Match pattern: ["at0000"] = < ... >
        // Need to handle nested angle brackets properly
        
        // First, find all term code positions
        const termPattern = /\["(at\d+)"\]\s*=\s*</g;
        let termMatch;
        const termPositions = [];
        
        while ((termMatch = termPattern.exec(content)) !== null) {
            termPositions.push({
                code: termMatch[1],
                startIndex: termMatch.index,
                contentStart: termMatch.index + termMatch[0].length
            });
        }
        
        // Process each term
        for (let i = 0; i < termPositions.length; i++) {
            const termInfo = termPositions[i];
            const code = termInfo.code;
            
            // Find the content between this term and the next (or end)
            let endIndex;
            if (i + 1 < termPositions.length) {
                endIndex = termPositions[i + 1].startIndex;
            } else {
                endIndex = content.length;
            }
            
            const termContent = content.substring(termInfo.contentStart, endIndex);
            
            // Extract text and description using simple patterns
            const text = this.extractTermValue(termContent, 'text');
            const description = this.extractTermValue(termContent, 'description');
            const comment = this.extractTermValue(termContent, 'comment');
            
            if (text) {
                target[code] = {
                    text: text,
                    description: description || '',
                    comment: comment || ''
                };
            }
        }
    }
    
    /**
     * Extract a term value like: text = <"Blood pressure">
     */
    extractTermValue(content, key) {
        // Pattern: key = <"value">
        const pattern = new RegExp(key + '\\s*=\\s*<"([^"]*)">', 'i');
        const match = content.match(pattern);
        return match ? match[1] : null;
    }

    /**
     * Resolve term codes to human-readable text
     * HARD-CODED RULE: Never display raw codes (at0000, at0001, etc.) in output
     * Always resolve to human-readable text from ontology
     */
    resolveTerms() {
        const resolveTerm = (code, lang) => {
            lang = lang || this.archetype.originalLanguage;
            const ontology = this.archetype.ontology[lang] || this.archetype.ontology['en'] || {};
            const term = ontology[code];
            
            // RULE: Never return raw codes - always human-readable text
            if (!term || !term.text || term.text.trim() === '') {
                console.warn(`No term found for code ${code} in language ${lang}`);
                return { text: `[Unknown field: ${code}]`, description: '' };
            }
            return term;
        };

        // Resolve data fields
        this.archetype.definition.dataFields.forEach(field => {
            const term = resolveTerm(field.code);
            field.name = term.text;
            field.description = term.description;
            
            if (field.constraints && field.constraints.allowedCodes) {
                field.constraints.options = field.constraints.allowedCodes.map(c => {
                    const optTerm = resolveTerm(c);
                    return { code: c, text: optTerm.text, description: optTerm.description };
                });
            }
        });

        // Resolve state fields
        this.archetype.definition.stateFields.forEach(field => {
            const term = resolveTerm(field.code);
            field.name = term.text;
            field.description = term.description;
            
            if (field.constraints && field.constraints.allowedCodes) {
                field.constraints.options = field.constraints.allowedCodes.map(c => {
                    const optTerm = resolveTerm(c);
                    return { code: c, text: optTerm.text, description: optTerm.description };
                });
            }
        });

        // Resolve protocol fields
        this.archetype.definition.protocolFields.forEach(field => {
            const term = resolveTerm(field.code);
            field.name = term.text;
            field.description = term.description;
            
            if (field.constraints && field.constraints.allowedCodes) {
                field.constraints.options = field.constraints.allowedCodes.map(c => {
                    const optTerm = resolveTerm(c);
                    return { code: c, text: optTerm.text, description: optTerm.description };
                });
            }
        });

        // Resolve generic fields
        this.archetype.definition.allFields.forEach(field => {
            const term = resolveTerm(field.code);
            field.name = term.text;
            field.description = term.description;

            if (field.constraints && field.constraints.allowedCodes) {
                field.constraints.options = field.constraints.allowedCodes.map(c => {
                    const optTerm = resolveTerm(c);
                    return { code: c, text: optTerm.text, description: optTerm.description };
                });
            }
        });

        // Resolve concept
        const conceptTerm = resolveTerm(this.archetype.concept);
        this.archetype.conceptName = conceptTerm.text;
        this.archetype.conceptDescription = conceptTerm.description;
    }

    /**
     * Get terms for a specific language
     * HARD-CODED RULE: Never display raw codes - always resolve to text
     */
    getTermsForLanguage(lang) {
        const result = JSON.parse(JSON.stringify(this.archetype));
        
        const resolveTerm = (code) => {
            const ontology = this.archetype.ontology[lang] || this.archetype.ontology['en'] || {};
            const term = ontology[code];
            
            // RULE: Never return raw codes - always human-readable text
            if (!term || !term.text || term.text.trim() === '') {
                console.warn(`No term found for code ${code} in language ${lang}`);
                return { text: `[Unknown field: ${code}]`, description: '' };
            }
            return term;
        };

        // Re-resolve all terms for the specified language
        result.definition.dataFields.forEach(field => {
            const term = resolveTerm(field.code);
            field.name = term.text;
            field.description = term.description;
            
            if (field.constraints && field.constraints.allowedCodes) {
                field.constraints.options = field.constraints.allowedCodes.map(c => {
                    const optTerm = resolveTerm(c);
                    return { code: c, text: optTerm.text, description: optTerm.description };
                });
            }
        });

        result.definition.stateFields.forEach(field => {
            const term = resolveTerm(field.code);
            field.name = term.text;
            field.description = term.description;
            
            if (field.constraints && field.constraints.allowedCodes) {
                field.constraints.options = field.constraints.allowedCodes.map(c => {
                    const optTerm = resolveTerm(c);
                    return { code: c, text: optTerm.text, description: optTerm.description };
                });
            }
        });

        result.definition.protocolFields.forEach(field => {
            const term = resolveTerm(field.code);
            field.name = term.text;
            field.description = term.description;
            
            if (field.constraints && field.constraints.allowedCodes) {
                field.constraints.options = field.constraints.allowedCodes.map(c => {
                    const optTerm = resolveTerm(c);
                    return { code: c, text: optTerm.text, description: optTerm.description };
                });
            }
        });

        result.definition.allFields.forEach(field => {
            const term = resolveTerm(field.code);
            field.name = term.text;
            field.description = term.description;

            if (field.constraints && field.constraints.allowedCodes) {
                field.constraints.options = field.constraints.allowedCodes.map(c => {
                    const optTerm = resolveTerm(c);
                    return { code: c, text: optTerm.text, description: optTerm.description };
                });
            }
        });

        const conceptTerm = resolveTerm(this.archetype.concept);
        result.conceptName = conceptTerm.text;
        result.conceptDescription = conceptTerm.description;

        // Get description for this language
        result.descriptionForLang = this.archetype.description[lang] || this.archetype.description['en'] || {};

        return result;
    }

    /**
     * Extract a named section from the ADL content
     */
    extractSection(sectionName) {
        const sectionRegex = new RegExp(`${sectionName}\\s*(?:=\\s*<)?([\\s\\S]*?)(?=\\n[a-z_]+\\s*(?:=|matches)|$)`, 'i');
        const match = this.rawContent.match(sectionRegex);
        return match ? match[0] : null;
    }

    /**
     * Extract a simple value from ADL content
     */
    extractValue(content, key) {
        const regex = new RegExp(`${key}\\s*=\\s*<"([^"]*)">`);
        const match = content.match(regex);
        return match ? match[1] : '';
    }

    /**
     * Extract a list value from ADL content
     */
    extractListValue(content, key) {
        const regex = new RegExp(`${key}\\s*=\\s*<([^>]*)>`);
        const match = content.match(regex);
        if (!match) return [];
        
        const values = match[1].match(/"([^"]+)"/g);
        return values ? values.map(v => v.replace(/"/g, '')) : [];
    }
}

// Export for use in other modules
window.ADLParser = ADLParser;
