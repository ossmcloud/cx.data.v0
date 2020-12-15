'use strict'

class DBRecordField {
    // private declarations
    #name = '';                 // the name of the field
    #record = null;             // the record object this field belongs to
    #tableField = '';           // the table field object of the object's table object
    #valueOriginal = undefined; // the original value (as per when record loaded)
    #value = null;              // the actual field value
    #on_change = [];
    // constructor
    constructor(record, tableField, defaultValue) {
        this.#record = record;
        this.#tableField = tableField;
        this.#name = tableField.name;
        this.#value = defaultValue; 
        this.#valueOriginal = this.value;
    }

    get name() { return this.#name; }
    get tableField() { return this.#tableField; }
    get valueOriginal() { return this.#valueOriginal; }

    get dirty() {
        return this.value != this.#valueOriginal;
    }

    get value() {
        return this.#value;
    } set value(val) {
        if (val === this.#value) { return; }
        this.#value = val;
        this.#on_change.forEach(onChange => {
            try {
                onChange(this);
            } catch (error) {
                // TODO: error handling
                console.log(error);
            }
        });
    }

    onChange(handler) {
        if (this.#on_change.indexOf(handler)) { return; }
        this.#on_change.push(handler);
    }
    

    static getValue(fromObject, fieldName, defaultValue) {
        if (!fromObject) { fromObject = {}; }
        var fieldValue = null;
        if (fromObject[fieldName] !== undefined) {
            fieldValue = fromObject[fieldName];
        } else {
            if (defaultValue !== undefined) {
                fieldValue = defaultValue;
                if (fieldValue == 'now') { fieldValue = new Date(); }
            }
        }
        return fieldValue;
    }
}

module.exports = DBRecordField;