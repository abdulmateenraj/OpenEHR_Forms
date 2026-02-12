/**
 * PDF Form Generator for OpenEHR Archetypes
 * Generates FILLABLE PDF forms with AcroForm fields
 * 
 * IMPORTANT: jsPDF drawing uses top-left origin (y increases downward)
 *            AcroForm uses bottom-left origin (y increases upward)
 *            We must convert coordinates for form fields!
 */

class PDFFormGenerator {
    constructor() {
        this.doc = null;
        this.pageWidth = 210; // A4 width in mm
        this.pageHeight = 297; // A4 height in mm
        this.margin = 15;
        this.contentWidth = this.pageWidth - (2 * this.margin);
        this.yPosition = 0;
        this.lineHeight = 5;
        this.fieldHeight = 7;
        this.sectionGap = 10;
        this.fieldGap = 4;
        this.labelGap = 2;
        this.fieldCounter = 0;
        this.colors = {
            primary: [44, 62, 80],
            secondary: [52, 152, 219],
            text: [51, 51, 51],
            lightText: [119, 119, 119],
            border: [180, 180, 180],
            white: [255, 255, 255],
            fieldBg: [250, 250, 255]
        };
    }

    /**
     * Convert y coordinate from top-origin to bottom-origin for AcroForm
     */
    convertY(topY, height) {
        return this.pageHeight - topY - height;
    }

    /**
     * Generate unique field name
     */
    getFieldName(baseName) {
        this.fieldCounter++;
        const sanitized = baseName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
        return `field_${this.fieldCounter}_${sanitized}`;
    }

    /**
     * Generate a fillable PDF form from an archetype
     */
    generate(archetype, options = {}) {
        const { jsPDF } = window.jspdf;
        
        this.doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        this.options = {
            title: options.title || archetype.conceptName || 'OpenEHR Observation Form',
            includeDescriptions: options.includeDescriptions !== false,
            includeProtocol: options.includeProtocol !== false,
            language: options.language || 'en'
        };

        this.yPosition = this.margin;
        this.fieldCounter = 0;

        // Build the form
        this.addHeader(archetype);
        this.addPatientInfoSection();
        this.addDataSection(archetype.definition.dataFields, 'Observation Data');
        
        if (archetype.definition.stateFields && archetype.definition.stateFields.length > 0) {
            this.addDataSection(archetype.definition.stateFields, 'Patient State');
        }
        
        if (this.options.includeProtocol && archetype.definition.protocolFields && archetype.definition.protocolFields.length > 0) {
            this.addDataSection(archetype.definition.protocolFields, 'Measurement Protocol');
        }

        if (archetype.definition.allFields && archetype.definition.allFields.length > 0) {
            this.addDataSection(archetype.definition.allFields, 'Archetype Fields');
        }

        this.addDocumentationSection();
        this.addFooter(archetype);

        return this.doc;
    }

    /**
     * Add document header
     */
    addHeader(archetype) {
        // Header background
        this.doc.setFillColor(...this.colors.primary);
        this.doc.rect(0, 0, this.pageWidth, 40, 'F');

        // Title
        this.doc.setTextColor(...this.colors.white);
        this.doc.setFontSize(18);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(this.options.title, this.margin, 15);

        // Description
        const description = archetype.conceptDescription || archetype.descriptionForLang?.purpose || '';
        if (description) {
            this.doc.setFontSize(9);
            this.doc.setFont('helvetica', 'normal');
            const shortDesc = description.length > 120 ? description.substring(0, 120) + '...' : description;
            this.doc.text(shortDesc, this.margin, 23, { maxWidth: this.contentWidth - 50 });
        }

        // Archetype ID
        this.doc.setFontSize(7);
        this.doc.setTextColor(180, 180, 180);
        this.doc.text(`ID: ${archetype.id}`, this.margin, 36);

        // Date field in header
        this.doc.setTextColor(...this.colors.white);
        this.doc.setFontSize(9);
        this.doc.text('Form Date:', this.pageWidth - this.margin - 45, 15);
        
        // Date input field
        this.addFormTextField('FormDate', this.pageWidth - this.margin - 45, 18, 43, 6);

        this.yPosition = 48;
    }

    /**
     * Add a fillable text field with visual border
     */
    addFormTextField(name, x, y, width, height, options = {}) {
        const fieldName = this.getFieldName(name);
        
        // Draw visual field background and border
        this.doc.setFillColor(...this.colors.fieldBg);
        this.doc.setDrawColor(...this.colors.border);
        this.doc.setLineWidth(0.3);
        this.doc.roundedRect(x, y, width, height, 1, 1, 'FD');
        
        // Add AcroForm text field (jsPDF AcroForm expects top-left origin)
        try {
            const { jsPDF } = window.jspdf;
            if (jsPDF.AcroForm && jsPDF.AcroForm.TextField) {
                const textField = new jsPDF.AcroForm.TextField();
                textField.fieldName = fieldName;
                // Rect format is [x, y, width, height] in jsPDF coordinates
                textField.Rect = [x, y, width, height];
                textField.multiline = options.multiline || false;
                textField.maxFontSize = options.fontSize || 9;
                textField.textAlign = options.align || 'left';
                this.doc.addField(textField);
            }
        } catch (e) {
            console.log('AcroForm TextField:', e.message);
        }
        
        return fieldName;
    }

    /**
     * Add a fillable checkbox
     */
    addFormCheckbox(name, x, y, size = 4, label = '') {
        const fieldName = this.getFieldName(name);
        
        // Draw visual checkbox
        this.doc.setFillColor(...this.colors.white);
        this.doc.setDrawColor(...this.colors.border);
        this.doc.setLineWidth(0.3);
        this.doc.rect(x, y, size, size, 'FD');
        
        // Draw label next to checkbox
        if (label) {
            this.doc.setFont('helvetica', 'normal');
            this.doc.setFontSize(8);
            this.doc.setTextColor(...this.colors.text);
            this.doc.text(label, x + size + 2, y + size - 0.5);
        }
        
        // Add AcroForm checkbox (jsPDF AcroForm expects top-left origin)
        try {
            const { jsPDF } = window.jspdf;
            if (jsPDF.AcroForm && jsPDF.AcroForm.CheckBox) {
                const checkbox = new jsPDF.AcroForm.CheckBox();
                checkbox.fieldName = fieldName;
                // Rect format is [x, y, width, height] in jsPDF coordinates
                checkbox.Rect = [x, y, size, size];
                checkbox.appearanceState = 'Off';
                this.doc.addField(checkbox);
            }
        } catch (e) {
            console.log('AcroForm Checkbox:', e.message);
        }
        
        return fieldName;
    }

    /**
     * Add patient information section
     */
    addPatientInfoSection() {
        this.addSectionHeader('Patient Information');

        // Row 1: Patient Name and DOB
        this.addLabelAboveField('Patient Name', this.margin, this.yPosition, this.contentWidth * 0.55);
        this.addLabelAboveField('Date of Birth', this.margin + this.contentWidth * 0.58, this.yPosition, this.contentWidth * 0.42);
        this.yPosition += this.lineHeight + this.fieldHeight + this.fieldGap;

        // Row 2: ID, Gender, Age
        this.addLabelAboveField('Patient ID / MRN', this.margin, this.yPosition, this.contentWidth * 0.4);
        this.addLabelAboveField('Gender', this.margin + this.contentWidth * 0.43, this.yPosition, this.contentWidth * 0.25);
        this.addLabelAboveField('Age', this.margin + this.contentWidth * 0.71, this.yPosition, this.contentWidth * 0.29);
        this.yPosition += this.lineHeight + this.fieldHeight + this.sectionGap;
    }

    /**
     * Add label above a text field
     */
    addLabelAboveField(label, x, y, width) {
        // Label
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(8);
        this.doc.setTextColor(...this.colors.text);
        this.doc.text(label, x, y + 3);
        
        // Field below
        const fieldY = y + this.lineHeight;
        this.addFormTextField(label, x, fieldY, width, this.fieldHeight);
    }

    /**
     * Add section header
     */
    addSectionHeader(title) {
        this.checkPageBreak(20);

        this.doc.setFillColor(...this.colors.secondary);
        this.doc.roundedRect(this.margin, this.yPosition, this.contentWidth, 8, 1.5, 1.5, 'F');

        this.doc.setTextColor(...this.colors.white);
        this.doc.setFontSize(10);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(title, this.margin + 4, this.yPosition + 5.5);

        this.yPosition += 12;
    }

    /**
     * Add data section with archetype fields
     */
    addDataSection(fields, sectionTitle) {
        if (!fields || fields.length === 0) return;

        this.addSectionHeader(sectionTitle);

        fields.forEach(field => {
            this.addArchetypeField(field);
        });

        this.yPosition += 3;
    }

    /**
     * Add a single archetype field based on its type
     */
    addArchetypeField(field) {
        if (!field.name || field.name.startsWith('@')) return;
        if (field.name.includes('at0') || field.name.includes('Unknown')) {
            console.warn('Skipping unresolved field:', field);
            return;
        }

        this.checkPageBreak(this.options.includeDescriptions && field.description ? 25 : 18);
        
        switch (field.type) {
            case 'QUANTITY':
                this.addQuantityField(field);
                break;
            case 'CODED_TEXT':
                this.addCodedTextField(field);
                break;
            case 'TEXT':
            case 'DURATION':
            default:
                this.addSimpleTextField(field);
                break;
        }

        // Description
        if (this.options.includeDescriptions && field.description) {
            this.addDescription(field.description);
        }
    }

    /**
     * Add a simple text field (label above, field below)
     */
    addSimpleTextField(field) {
        // Label
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(9);
        this.doc.setTextColor(...this.colors.text);
        this.doc.text(field.name, this.margin, this.yPosition + 3);
        
        this.yPosition += this.lineHeight + this.labelGap;
        
        // Field
        this.addFormTextField(field.name, this.margin, this.yPosition, this.contentWidth, this.fieldHeight);
        
        this.yPosition += this.fieldHeight + this.fieldGap;
    }

    /**
     * Add a quantity field with units
     */
    addQuantityField(field) {
        const units = field.constraints?.units || '';
        const range = field.constraints?.range || '';
        
        // Label
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(9);
        this.doc.setTextColor(...this.colors.text);
        this.doc.text(field.name, this.margin, this.yPosition + 3);
        
        this.yPosition += this.lineHeight + this.labelGap;
        
        // Input field (narrower for quantities)
        const inputWidth = 40;
        this.addFormTextField(field.name, this.margin, this.yPosition, inputWidth, this.fieldHeight);
        
        // Units
        let unitX = this.margin + inputWidth + 3;
        if (units) {
            this.doc.setFont('helvetica', 'normal');
            this.doc.setFontSize(9);
            this.doc.setTextColor(...this.colors.secondary);
            this.doc.text(units, unitX, this.yPosition + 5);
            unitX += this.doc.getTextWidth(units) + 5;
        }
        
        // Range hint
        if (range) {
            this.doc.setFontSize(7);
            this.doc.setTextColor(...this.colors.lightText);
            this.doc.text(`(${range})`, unitX, this.yPosition + 5);
        }
        
        this.yPosition += this.fieldHeight + this.fieldGap;
    }

    /**
     * Add a coded text field with checkboxes for options
     */
    addCodedTextField(field) {
        const options = field.constraints?.options || [];
        
        // Label
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(9);
        this.doc.setTextColor(...this.colors.text);
        this.doc.text(field.name, this.margin, this.yPosition + 3);
        
        this.yPosition += this.lineHeight + this.labelGap;
        
        if (options.length > 0) {
            // Calculate checkbox layout
            const checkboxSize = 3.5;
            const itemPadding = 8;
            let xPos = this.margin;
            const maxX = this.margin + this.contentWidth;
            
            options.forEach((option, index) => {
                const optionText = option.text || '';
                if (!optionText || optionText.includes('at0')) return;
                
                const textWidth = this.doc.getTextWidth(optionText);
                const itemWidth = checkboxSize + 2 + textWidth + itemPadding;
                
                // Wrap to next line if needed
                if (xPos + itemWidth > maxX && xPos > this.margin) {
                    xPos = this.margin;
                    this.yPosition += this.lineHeight + 2;
                    this.checkPageBreak(10);
                }
                
                // Checkbox with label
                this.addFormCheckbox(`${field.name}_${index}`, xPos, this.yPosition, checkboxSize, optionText);
                
                xPos += itemWidth;
            });
            
            this.yPosition += this.lineHeight + this.fieldGap;
        } else {
            // Fallback to text field if no options
            this.addFormTextField(field.name, this.margin, this.yPosition, this.contentWidth, this.fieldHeight);
            this.yPosition += this.fieldHeight + this.fieldGap;
        }
    }

    /**
     * Add field description
     */
    addDescription(description) {
        if (!description) return;
        
        this.doc.setFont('helvetica', 'italic');
        this.doc.setFontSize(7);
        this.doc.setTextColor(...this.colors.lightText);
        
        const lines = this.doc.splitTextToSize(description, this.contentWidth - 5);
        const displayLines = lines.slice(0, 2);
        
        this.doc.text(displayLines, this.margin + 2, this.yPosition);
        this.yPosition += (displayLines.length * 3) + 2;
    }

    /**
     * Add documentation section
     */
    addDocumentationSection() {
        this.checkPageBreak(55);
        
        this.addSectionHeader('Documentation');
        
        // Row 1: Time and Location
        this.addLabelAboveField('Time of Observation', this.margin, this.yPosition, this.contentWidth * 0.4);
        this.addLabelAboveField('Location', this.margin + this.contentWidth * 0.43, this.yPosition, this.contentWidth * 0.57);
        this.yPosition += this.lineHeight + this.fieldHeight + this.fieldGap;
        
        // Comments
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(9);
        this.doc.setTextColor(...this.colors.text);
        this.doc.text('Additional Comments', this.margin, this.yPosition + 3);
        this.yPosition += this.lineHeight + this.labelGap;
        
        this.addFormTextField('Comments', this.margin, this.yPosition, this.contentWidth, 18, { multiline: true });
        this.yPosition += 22;
        
        // Clinician info
        this.addLabelAboveField('Clinician Name', this.margin, this.yPosition, this.contentWidth * 0.48);
        this.addLabelAboveField('Date / Time', this.margin + this.contentWidth * 0.52, this.yPosition, this.contentWidth * 0.48);
        this.yPosition += this.lineHeight + this.fieldHeight + this.fieldGap;
        
        // Signature area
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(9);
        this.doc.setTextColor(...this.colors.text);
        this.doc.text('Signature', this.margin, this.yPosition + 3);
        this.yPosition += this.lineHeight + this.labelGap;
        
        // Signature box (not a form field, just a visual box for wet signature)
        this.doc.setFillColor(...this.colors.white);
        this.doc.setDrawColor(...this.colors.border);
        this.doc.setLineWidth(0.3);
        this.doc.roundedRect(this.margin, this.yPosition, this.contentWidth * 0.5, 12, 1, 1, 'FD');
        
        this.yPosition += 15;
    }

    /**
     * Add footer to all pages
     */
    addFooter(archetype) {
        const totalPages = this.doc.internal.getNumberOfPages();

        for (let i = 1; i <= totalPages; i++) {
            this.doc.setPage(i);

            this.doc.setDrawColor(...this.colors.border);
            this.doc.line(this.margin, this.pageHeight - 12, this.pageWidth - this.margin, this.pageHeight - 12);

            this.doc.setTextColor(...this.colors.lightText);
            this.doc.setFontSize(7);
            this.doc.setFont('helvetica', 'normal');

            this.doc.text(`Source: ${archetype.id}`, this.margin, this.pageHeight - 8);

            const pageText = `Page ${i} of ${totalPages}`;
            const pageTextWidth = this.doc.getTextWidth(pageText);
            this.doc.text(pageText, (this.pageWidth - pageTextWidth) / 2, this.pageHeight - 8);

            const dateText = new Date().toLocaleDateString();
            const dateTextWidth = this.doc.getTextWidth(dateText);
            this.doc.text(dateText, this.pageWidth - this.margin - dateTextWidth, this.pageHeight - 8);
        }
    }

    /**
     * Check if page break is needed
     */
    checkPageBreak(requiredSpace) {
        if (this.yPosition + requiredSpace > this.pageHeight - 20) {
            this.doc.addPage();
            this.yPosition = this.margin;
            return true;
        }
        return false;
    }

    /**
     * Download the PDF
     */
    download(filename) {
        if (!this.doc) {
            throw new Error('No PDF document generated');
        }
        this.doc.save(filename || 'openehr-form.pdf');
    }
}

// Export
window.PDFFormGenerator = PDFFormGenerator;
