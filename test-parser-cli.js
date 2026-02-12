// Test script to debug ADL parsing
// Run with: node test-parser-cli.js

const fs = require('fs');

// Read the ADL parser
const parserCode = fs.readFileSync('adl-parser.js', 'utf8');

// Create a mock window object for the parser
global.window = {};

// Execute the parser code
eval(parserCode);

// Get the parser class
const ADLParser = global.window.ADLParser;

// Read the ADL file
const adlContent = fs.readFileSync('openEHR-EHR-OBSERVATION.blood_pressure.v2.adl', 'utf8');

console.log('=== ADL Parser Debug Test ===\n');

// Create parser and parse
const parser = new ADLParser();
const archetype = parser.parse(adlContent);

console.log('1. ARCHETYPE INFO:');
console.log('   ID:', archetype.id);
console.log('   Concept code:', archetype.concept);
console.log('   Concept name:', archetype.conceptName);
console.log('   Original language:', archetype.originalLanguage);
console.log('   Available languages:', archetype.availableLanguages.join(', '));

console.log('\n2. ONTOLOGY CHECK:');
const languages = Object.keys(archetype.ontology);
console.log('   Languages in ontology:', languages.join(', ') || 'NONE!');

if (languages.length > 0) {
    const enOntology = archetype.ontology['en'] || {};
    const termCount = Object.keys(enOntology).length;
    console.log('   English term count:', termCount);
    
    if (termCount > 0) {
        console.log('\n   Sample terms:');
        ['at0000', 'at0004', 'at0005', 'at1006', 'at1007', 'at1059', 'at0033'].forEach(code => {
            const term = enOntology[code];
            if (term) {
                console.log(`     ${code} => "${term.text}"`);
            } else {
                console.log(`     ${code} => NOT FOUND`);
            }
        });
    } else {
        console.log('   ERROR: No terms parsed!');
    }
} else {
    console.log('   ERROR: No languages found in ontology!');
}

console.log('\n3. DATA FIELDS:');
console.log('   Count:', archetype.definition.dataFields.length);
archetype.definition.dataFields.forEach(f => {
    const isResolved = f.name && !f.name.includes('at0') && !f.name.includes('Unknown');
    const status = isResolved ? '✓' : '✗';
    console.log(`   ${status} ${f.code} => "${f.name}" (${f.type})`);
});

const enOntology = archetype.ontology['en'] || {};

console.log('\n4. STATE FIELDS:');
console.log('   Count:', archetype.definition.stateFields.length);
archetype.definition.stateFields.forEach(f => {
    const isResolved = f.name && !f.name.includes('at0') && !f.name.includes('Unknown');
    const status = isResolved ? '✓' : '✗';
    console.log(`   ${status} ${f.code} => "${f.name}" (${f.type})`);
    if (f.constraints && f.constraints.allowedCodes) {
        const resolvedOptions = f.constraints.allowedCodes.map(code => {
            const term = enOntology[code];
            return term ? term.text : code;
        });
        console.log(`      Options: ${resolvedOptions.join(', ')}`);
    }
});

console.log('\n5. PROTOCOL FIELDS:');
console.log('   Count:', archetype.definition.protocolFields.length);
archetype.definition.protocolFields.forEach(f => {
    const isResolved = f.name && !f.name.includes('at0') && !f.name.includes('Unknown');
    const status = isResolved ? '✓' : '✗';
    console.log(`   ${status} ${f.code} => "${f.name}" (${f.type})`);
    if (f.constraints && f.constraints.allowedCodes) {
        const resolvedOptions = f.constraints.allowedCodes.map(code => {
            const term = enOntology[code];
            return term ? term.text : code;
        });
        console.log(`      Options: ${resolvedOptions.join(', ')}`);
    }
});

console.log('\n=== END TEST ===');
