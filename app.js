/**
 * Main Application Script
 * Handles file upload, parsing, preview, and PDF generation
 */

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const uploadBox = document.getElementById('uploadBox');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const removeFile = document.getElementById('removeFile');
    const optionsSection = document.getElementById('optionsSection');
    const languageSelect = document.getElementById('languageSelect');
    const formTitle = document.getElementById('formTitle');
    const includeDescriptions = document.getElementById('includeDescriptions');
    const includeProtocol = document.getElementById('includeProtocol');
    const previewSection = document.getElementById('previewSection');
    const archetypeInfo = document.getElementById('archetypeInfo');
    const fieldsPreview = document.getElementById('fieldsPreview');
    const actionSection = document.getElementById('actionSection');
    const generatePdf = document.getElementById('generatePdf');
    const loadingOverlay = document.getElementById('loadingOverlay');

    // State
    let currentArchetype = null;
    let parser = new ADLParser();
    let pdfGenerator = new PDFFormGenerator();

    // Event Listeners
    uploadBox.addEventListener('click', () => fileInput.click());
    
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('dragover');
    });

    uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('dragover');
    });

    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    removeFile.addEventListener('click', () => {
        resetUI();
    });

    languageSelect.addEventListener('change', () => {
        if (currentArchetype) {
            updatePreview(languageSelect.value);
        }
    });

    generatePdf.addEventListener('click', () => {
        generatePdfDocument();
    });

    /**
     * Handle file upload
     */
    function handleFile(file) {
        if (!file.name.endsWith('.adl')) {
            alert('Please upload an ADL file (.adl extension)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                currentArchetype = parser.parse(content);
                
                // DEBUG: Log parsing results
                console.log('=== PARSING RESULTS ===');
                console.log('Archetype ID:', currentArchetype.id);
                console.log('Concept:', currentArchetype.concept, '->', currentArchetype.conceptName);
                console.log('Available languages:', currentArchetype.availableLanguages);
                console.log('Ontology languages:', Object.keys(currentArchetype.ontology));
                
                // Log sample terms from English ontology
                const enOntology = currentArchetype.ontology['en'] || {};
                console.log('English ontology term count:', Object.keys(enOntology).length);
                console.log('Sample terms from ontology:');
                ['at0000', 'at0004', 'at0005', 'at1006', 'at1007'].forEach(code => {
                    console.log(`  ${code} =>`, enOntology[code] ? enOntology[code].text : 'NOT FOUND');
                });
                
                // Log data fields
                console.log('Data Fields:');
                currentArchetype.definition.dataFields.forEach(f => {
                    console.log(`  ${f.code} => ${f.name} (${f.type})`);
                });
                console.log('=== END PARSING ===');
                
                // Update UI
                fileName.textContent = file.name;
                fileInfo.style.display = 'flex';
                uploadBox.style.display = 'none';

                // Populate language dropdown
                populateLanguages();

                // Show options and preview
                optionsSection.style.display = 'block';
                previewSection.style.display = 'block';
                actionSection.style.display = 'block';

                // Update preview
                updatePreview(currentArchetype.originalLanguage);

                // Set default title
                formTitle.placeholder = currentArchetype.conceptName || 'Enter custom title';

            } catch (error) {
                console.error('Error parsing ADL file:', error);
                alert('Error parsing ADL file: ' + error.message);
                resetUI();
            }
        };

        reader.onerror = () => {
            alert('Error reading file');
        };

        reader.readAsText(file);
    }

    /**
     * Populate language dropdown
     */
    function populateLanguages() {
        languageSelect.innerHTML = '';
        
        const languageNames = {
            'en': 'English',
            'de': 'German (Deutsch)',
            'es': 'Spanish (Español)',
            'fr': 'French (Français)',
            'pt-br': 'Portuguese - Brazil',
            'nl': 'Dutch (Nederlands)',
            'sv': 'Swedish (Svenska)',
            'nb': 'Norwegian (Bokmål)',
            'ja': 'Japanese (日本語)',
            'zh-cn': 'Chinese - Simplified (简体中文)',
            'ko': 'Korean (한국어)',
            'ru': 'Russian (Русский)',
            'ar-sy': 'Arabic (العربية)',
            'fa': 'Persian (فارسی)',
            'fi': 'Finnish (Suomi)',
            'el': 'Greek (Ελληνικά)',
            'ca': 'Catalan (Català)',
            'es-ar': 'Spanish - Argentina'
        };

        currentArchetype.availableLanguages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = languageNames[lang] || lang;
            if (lang === currentArchetype.originalLanguage) {
                option.selected = true;
            }
            languageSelect.appendChild(option);
        });
    }

    /**
     * Update preview section
     */
    function updatePreview(language) {
        const localizedArchetype = parser.getTermsForLanguage(language);

        // Update archetype info
        archetypeInfo.innerHTML = `
            <h4>${localizedArchetype.conceptName}</h4>
            <p>${localizedArchetype.conceptDescription || localizedArchetype.descriptionForLang?.purpose || ''}</p>
            <span class="archetype-id">${localizedArchetype.id}</span>
        `;

        // Update fields preview
        fieldsPreview.innerHTML = '';

        // Data fields
        if (localizedArchetype.definition.dataFields.length > 0) {
            const dataCategory = createFieldCategory('📊 Observation Data', localizedArchetype.definition.dataFields);
            fieldsPreview.appendChild(dataCategory);
        }

        // State fields
        if (localizedArchetype.definition.stateFields.length > 0) {
            const stateCategory = createFieldCategory('🧑‍⚕️ Patient State', localizedArchetype.definition.stateFields);
            fieldsPreview.appendChild(stateCategory);
        }

        // Protocol fields
        if (localizedArchetype.definition.protocolFields.length > 0) {
            const protocolCategory = createFieldCategory('⚙️ Measurement Protocol', localizedArchetype.definition.protocolFields);
            fieldsPreview.appendChild(protocolCategory);
        }

        // Generic fields (for non-Observation archetypes)
        if (localizedArchetype.definition.allFields.length > 0) {
            const genericCategory = createFieldCategory('📄 Archetype Fields', localizedArchetype.definition.allFields);
            fieldsPreview.appendChild(genericCategory);
        }
    }

    /**
     * Create a field category section
     */
    function createFieldCategory(title, fields) {
        const category = document.createElement('div');
        category.className = 'field-category';

        const header = document.createElement('div');
        header.className = 'category-header';
        header.textContent = title;
        category.appendChild(header);

        fields.forEach(field => {
            if (field.name && !field.name.startsWith('@')) {
                const fieldItem = createFieldItem(field);
                category.appendChild(fieldItem);
            }
        });

        return category;
    }

    /**
     * Create a field item element
     */
    function createFieldItem(field) {
        const item = document.createElement('div');
        item.className = 'field-item';

        const mainContent = document.createElement('div');
        mainContent.style.flex = '1';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'field-name';
        // RULE: Use human-readable text only, never codes
        nameDiv.textContent = field.name;
        if (!field.name || field.name.includes('at0')) {
            console.error('Field without proper resolution:', field);
            nameDiv.textContent = '[Unresolved field]';
            nameDiv.style.color = '#e74c3c';
        }
        mainContent.appendChild(nameDiv);

        if (field.description) {
            const descDiv = document.createElement('div');
            descDiv.className = 'field-description';
            descDiv.textContent = field.description.length > 150 
                ? field.description.substring(0, 150) + '...' 
                : field.description;
            mainContent.appendChild(descDiv);
        }

        if (field.constraints?.options && field.constraints.options.length > 0) {
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'field-options';
            // RULE: Use human-readable text only
            const optionTexts = field.constraints.options
                .filter(o => o.text && !o.text.includes('at0'))
                .map(o => o.text)
                .slice(0, 5);
            optionsDiv.textContent = 'Options: ' + optionTexts.join(', ') + 
                (field.constraints.options.length > 5 ? '...' : '');
            mainContent.appendChild(optionsDiv);
        }

        item.appendChild(mainContent);

        const typeSpan = document.createElement('span');
        typeSpan.className = 'field-type';
        
        switch(field.type) {
            case 'QUANTITY':
                typeSpan.classList.add('quantity');
                typeSpan.textContent = field.constraints?.units || 'Quantity';
                break;
            case 'CODED_TEXT':
                typeSpan.classList.add('coded');
                typeSpan.textContent = 'Selection';
                break;
            case 'TEXT':
                typeSpan.classList.add('text');
                typeSpan.textContent = 'Text';
                break;
            case 'CLUSTER':
                typeSpan.classList.add('cluster');
                typeSpan.textContent = 'Cluster';
                break;
            default:
                typeSpan.textContent = field.type || 'Text';
        }
        
        item.appendChild(typeSpan);

        return item;
    }

    /**
     * Generate PDF document
     */
    function generatePdfDocument() {
        if (!currentArchetype) {
            alert('Please upload an ADL file first');
            return;
        }

        loadingOverlay.style.display = 'flex';

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            try {
                const selectedLang = languageSelect.value;
                const localizedArchetype = parser.getTermsForLanguage(selectedLang);

                const options = {
                    title: formTitle.value || localizedArchetype.conceptName,
                    includeDescriptions: includeDescriptions.checked,
                    includeProtocol: includeProtocol.checked,
                    language: selectedLang
                };

                pdfGenerator.generate(localizedArchetype, options);

                // Generate filename
                const safeName = (localizedArchetype.conceptName || 'openehr-form')
                    .replace(/[^a-z0-9]/gi, '_')
                    .toLowerCase();
                const filename = `${safeName}_form_${selectedLang}.pdf`;

                pdfGenerator.download(filename);

            } catch (error) {
                console.error('Error generating PDF:', error);
                alert('Error generating PDF: ' + error.message);
            } finally {
                loadingOverlay.style.display = 'none';
            }
        }, 100);
    }

    /**
     * Reset UI to initial state
     */
    function resetUI() {
        currentArchetype = null;
        fileInput.value = '';
        fileName.textContent = '';
        fileInfo.style.display = 'none';
        uploadBox.style.display = 'block';
        optionsSection.style.display = 'none';
        previewSection.style.display = 'none';
        actionSection.style.display = 'none';
        formTitle.value = '';
        archetypeInfo.innerHTML = '';
        fieldsPreview.innerHTML = '';
    }
});
