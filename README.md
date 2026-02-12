# OpenEHR Archetype to PDF Form Generator

## Overview
This web application parses OpenEHR observation archetypes (ADL 1.4 format) and generates professional fillable PDF forms for clinical documentation.

## Features
- ✅ Parse OpenEHR ADL 1.4 archetype files
- ✅ Multi-language support (18+ languages)
- ✅ Interactive preview of all fields
- ✅ Customizable form options
- ✅ Professional PDF generation with proper field types
- ✅ Patient information section
- ✅ Signature and documentation sections

## Core Design Rules

### **HARD-CODED RULE: Human-Readable Text Only**

**The system NEVER displays raw identifier codes (at0000, at0001, etc.) in any output.**

All identifiers are automatically resolved to human-readable text from the archetype's ontology section:

```adl
ontology
    term_definitions = <
        ["en"] = <
            items = <
                ["at0000"] = <
                    text = <"Blood pressure">
                    description = <"The local measurement of arterial blood pressure...">
                >
                ["at0004"] = <
                    text = <"Systolic">
                    description = <"Peak systemic arterial blood pressure...">
                >
```

**Implementation:**
- `adl-parser.js`: Resolves all codes to text in `resolveTerms()` method
- `pdf-generator.js`: Only uses `field.name` (resolved text), never `field.code`
- `app.js`: Displays warnings for any unresolved fields

**This applies to:**
- All data fields (observations)
- All state fields (patient conditions)
- All protocol fields (measurement methods)
- All coded options (dropdown/checkbox values)
- Form titles and headers

## How to Use

### 1. Start the Application
- Install the **Live Server** extension in VS Code
- Right-click `index.html` and select "Open with Live Server"
- Or simply open `index.html` in a modern web browser

### 2. Upload an Archetype
- Drag and drop an `.adl` file onto the upload area
- Or click to browse and select a file
- Example: `openEHR-EHR-OBSERVATION.blood_pressure.v2.adl` is included

### 3. Configure Options
- **Language**: Select from all available translations in the archetype
- **Form Title**: Customize the title (defaults to archetype concept name)
- **Include Descriptions**: Toggle field descriptions in PDF
- **Include Protocol**: Toggle measurement protocol/method fields

### 4. Preview & Generate
- Review all extracted fields in the preview section
- Click "Generate Fillable PDF Form"
- PDF will download automatically with a descriptive filename

## File Structure

```
├── index.html           # Main HTML page
├── styles.css           # Styling and responsive design
├── adl-parser.js        # ADL 1.4 parser with term resolution
├── pdf-generator.js     # PDF form generator using jsPDF
├── app.js              # Main application logic
└── README.md           # This file
```

## Supported Field Types

The generator handles all standard OpenEHR field types:

| Type | PDF Representation | Example |
|------|-------------------|---------|
| `DV_QUANTITY` | Input field with units | "120 mm[Hg]" |
| `DV_CODED_TEXT` | Checkboxes/radio buttons | Position: ☐ Standing ☐ Sitting |
| `DV_TEXT` | Text input field | Comments: ___________ |
| `DV_DURATION` | Duration input | Time: _________ |
| `CLUSTER` | Multi-line text area | Additional information |

## Technical Details

### Dependencies
- **jsPDF** 2.5.1 - PDF generation
- **jsPDF-AutoTable** 3.5.31 - Table support (for future enhancements)

Both loaded from CDN - no installation required.

### Browser Compatibility
- Chrome/Edge (recommended)
- Firefox
- Safari
- Any modern browser with JavaScript enabled

### ADL Version Support
- **ADL 1.4** ✅ Fully supported
- **ADL 2.x** ❌ Not yet supported

## Archetype Structure Parsed

The parser extracts:

1. **Header**: Archetype ID, concept code
2. **Languages**: Original language and all translations
3. **Description**: Purpose, use, misuse, keywords (per language)
4. **Definition**: 
   - Data fields (observation values)
   - State fields (patient state)
   - Protocol fields (measurement methods)
5. **Ontology**: Term definitions for all codes in all languages

## Generated PDF Structure

1. **Header** - Title, description, archetype ID, date field
2. **Patient Information** - Name, DOB, ID, Gender, Age
3. **Observation Data** - All data fields with appropriate input types
4. **Patient State** - Position, confounding factors, etc.
5. **Measurement Protocol** - Method, device, location (if enabled)
6. **Documentation** - Time, location, comments
7. **Signatures** - Clinician name and signature
8. **Footer** - Page numbers, archetype ID, generation date

## Example Output

For the blood pressure archetype, the generated PDF includes:

- **Systolic** (quantity field with mm[Hg] units)
- **Diastolic** (quantity field with mm[Hg] units)
- **Mean arterial pressure** (quantity field)
- **Pulse pressure** (quantity field)
- **Position** (checkboxes: Standing, Sitting, Lying, etc.)
- **Cuff size** (checkboxes: Adult, Large Adult, etc.)
- **Location of measurement** (checkboxes: Right arm, Left arm, etc.)
- **Method** (checkboxes: Auscultation, Palpation, Machine, Invasive)

All field labels use human-readable text like "**Systolic**" instead of codes like "at0004".

## Validation & Error Handling

- Invalid ADL files show descriptive error messages
- Missing terms are logged to console with warnings
- Unresolved fields are skipped from PDF generation
- File format validation (must be .adl extension)

## Future Enhancements

Potential improvements:
- [ ] ADL 2.x support
- [ ] Template support (OPT files)
- [ ] Digital signature fields
- [ ] PDF form field interactivity (fillable in PDF readers)
- [ ] Batch processing of multiple archetypes
- [ ] FHIR Questionnaire export
- [ ] Custom styling themes

## License

This tool is provided as-is for educational and clinical documentation purposes.

## Disclaimer

⚠️ **Important**: This tool generates forms based on archetype structure. Always verify clinical accuracy and completeness before use in production environments.

---

**Generated**: January 2026  
**Compatible with**: OpenEHR ADL 1.4 format  
**Tested with**: Blood Pressure, and other OBSERVATION archetypes
