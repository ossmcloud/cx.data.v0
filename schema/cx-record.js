'use strict'

//const _cx_core = require('../../cx-core');
const _core = require('cx-core');
const _ex = require('cx-core/errors/cx-errors');
const _cx_sql_utils = require('./cx-record-tsql');
const DBRecordField = require('./cx-record-field');

//
const _recordState = {
    get NEW() { return 'new' },
    get EDITED() { return 'edited' },
    get DELETED() { return 'deleted' },
    get UNCHANGED() { return 'unchanged' },
}

class DBRecord {
    // private declarations
    #table = null;
    #state = _recordState.NEW;
    #fields = {};
    #pkName = ''; 
    #brokenRules = [];
    #error = null;
    #rowVersion = null;
    constructor(table, defaults) {
        // TODO: validate arguments
        this.#table = table;
        if (!defaults) { defaults = {}; }
        // NOTE: this may or may not be there but it is irrelevant here, only used on update script to implement optimistic concurrency
        this.#rowVersion = defaults[_cx_sql_utils.RowVersionFieldName];
        // add object fields as properties
        for (const key in this.table.fields) {
            if (!this.table.fields.hasOwnProperty(key)) { continue; }
            // get table field
            const field = this.table.fields[key];
            // get value from defaults or from field default
            var fieldValue = DBRecordField.getValue(defaults, key, field.default);
            // add field object to fields collection
            this.#fields[key] = new DBRecordField(this, field, fieldValue);
            this.#fields[key].onChange(this.onFieldChange);
            // if a primary key get the field name so we can use for the 'id' property
            if (field.pk) {
                // TODO:MULTI-PK: build comma separated pk names for the property
                this.#pkName = key;
            }
        }
        // the set unchanged flag is set if the record is loaded from DB as opposed to be a new record 
        if (defaults.setUnchanged) { this.#state = _recordState.UNCHANGED; }
    }

    // read-only properties
    get type() { return this.#table.type; }
    get table() { return this.#table; }
    get fields() { return this.#fields; } 
    get rowVersion() { return this.#rowVersion; }
    get brokenRules() { return this.#brokenRules; }
    get cx() { return this.#table.cx; }

    get error() {
        return this.#error;
    } set error(val) {
        this.#error = val;
    }

    get created() {
        return this.getValue('created');
    } set created(val) {
        this.setValue('created');
    }
    get createdBy() {
        return this.getValue('createdBy');
    } set created(val) {
        this.setValue('createdBy');
    }


    // TODO: add created-by, modified, modified-by

    get id() {
        // TODO:MULTI-PK: return comma separated ids if more than one key
        return this.getValue(this.#pkName);
    } set id(val) {
        // TODO:MULTI-PK: parse comma separated ids if more than one key
        this.setValue(this.#pkName, val);
    }

    populate(options) {
        // populate from payload
        for (var key in options) {
            if (key == 'accountId' || key == 'recordId') { continue; }
            if (key == 'rowVersion') {
                // set row version (if new record nothing will happen)
                this.setRowVersion(options.rowVersion);
            } else {
                this[key] = options[key];
            }
        }
    }

    setRowVersion(rowVersion) {
        // do not set for new records
        if (this.isNew()) { return; }
        this.#rowVersion = rowVersion;
    }
    
    getValue(fieldName) {
        if (!this.hasField(fieldName)) { throw new Error('CXRecord::setValue - Cannot find field [' + fieldValue + '] in Table object [' + this.type + '] '); }
        return this.#fields[fieldName].value;
    }
    setValue(fieldName, value) {
        var recordField = this.#fields[fieldName];
        if (!recordField) { throw new Error('CXRecord::setValue - Cannot find field [' + fieldValue + '] in Table object [' + this.type + '] '); }
        recordField.value = value;
    }
    hasField(fieldName) {
        var recordField = this.#fields[fieldName];
        return recordField != undefined;
    }

    onFieldChange(field) {
        // set the record as edited
        this.#state = _recordState.EDITED;
    }

    dirty() {
        if (this.#state == _recordState.NEW) { return true; }
        if (this.#state == _recordState.DELETED) { return true; }
        // NOTE: we loop the fields and start at the 1st changed (we could use the state but just to be sure)
        var dirty = false;
        _core.list.eachProp(this.fields, function (key, field) {
            if (field.dirty) {
                dirty = true;
                return false;
            }
        });
        return dirty;
    }

    isNew() {
        return (this.#state == _recordState.NEW);
    }

    toString() {
        return '[object ' + this.constructor.name + ']';
    }


    validate() {
        this.#brokenRules = [];

        // TODO: CX-RECORD:: NEED TO FINE TUNE THIS ROUTINE IN FEW WAYS:
        //      USE DB DATA-TYPES
        //      BETTER ERROR HANDLING
        //      COMPACT... IT IS TOO LONG (MAYBE...)

        var _this = this;
        _core.list.eachProp(this.table.fields, function (fname, f) {
            // TODO: we do this or the check for maxLength fails, we must check the data type but we must fix the objectBuilder
            if (fname == 'created') { return true; }
            
            var fValue = _this[fname];

            // check for NOT NULL
            if (!f.null && !f.identity) {
                if (fValue === null || fValue === undefined || fValue === '') {
                    _this.#brokenRules.push({
                        field: f,
                        message: 'null value not allowed'
                    });
                }
            }

            // check max length
            if (f.maxLength && f.dataType === 'varchar') {
                var value = (fValue) ? fValue.toString() : '';
                if (value.length > f.maxLength) {
                    if (f.truncate) {
                        // truncate value of requested
                        _this[fname] = value.substring(0, f.maxLength);
                    } else {
                        _this.#brokenRules.push({
                            field: f,
                            message: 'value is too long (max allowed: ' + f.maxLength + ')',
                        });
                    }
                }
            }
        });

        // TODO: we want a better error message here
        if (this.#brokenRules.length > 0) {
            throw new Error('Record Validation Failed!');
        }
    }

    async save() {
        try {
            //if (!credentials) { credentials = { userId: 0, name: '- unknown -' }; }
            this.validate();
            if (this.dirty()) {

                if (this.isNew()) {
                    if (this.hasField('created')) { this.created = new Date(); }
                    if (this.hasField('createdBy')) { this.createdBy = this.cx.userId; }
                    //if (this.hasField('createdByText')) { this.createdByText = credentials.name; }
                }

                if (this.hasField('modified')) { this.modified = new Date(); }
                if (this.hasField('modifiedBy')) { this.modifiedBy = this.cx.userId; }

                var query = _cx_sql_utils.save(this);
                var res = await this.table.db.exec(query);
                this.id = res.id;
                this.#state = _recordState.UNCHANGED;
                // TODO: OPTIMISTIC CONCURRENCY: RELOAD ROW-VERSION
            }
            return this.id;
        } catch (error) {
            this.error = error;
            throw error;
        }
    }

}

module.exports = DBRecord;  