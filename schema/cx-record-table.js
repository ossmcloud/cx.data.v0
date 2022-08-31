'use strict'

const _core = require('cx-core');
const _cx_sql_utils = require('./cx-record-tsql');
const DBRecordQuery = require('./cx-record-query');


class DBTable {
    #tableName = null;
    #tableFields = null;
    #records = null;
    #primaryKeys = [];
    #db_context = null;
    #query = null;
    
    constructor(tableName, tableFields) {
        this.#tableName = tableName;
        this.#tableFields = tableFields;
        // populate primary key collection
        for (const key in tableFields) {
            if (!tableFields.hasOwnProperty(key)) { continue; }
            if (tableFields[key].pk) {
                this.#primaryKeys.push(tableFields[key]);
            }
        }
    }

    // read-only fields
    
    get type() { return this.#tableName; }
    get fields() { return this.#tableFields; }
    get primaryKeys() { return this.#primaryKeys; }
    get records() {
        if (!this.#records) { this.#records = []; }
        return this.#records;
    }
    get query() {
        if (!this.#query) { this.#query = new DBRecordQuery(this.type); }
        return this.#query;
    } set query(val) {
        this.#query = val;
    }


    // db-context
    // @CLEAN-UP: remove db property and refactor to cx where used
    get db() {
        if (!this.#db_context) { throw new Error('DB Context not set!!!'); }
        return this.#db_context;
    } set db(val) {
        this.#db_context = val;
    }

    get cx() {
        if (!this.#db_context) { throw new Error('DB Context not set!!!'); }
        return this.#db_context;
    } set cx(val) {
        this.#db_context = val;
    }
    
    // this MUST be inherited on extended classes
    createNew() {
        throw new Error('function createNew must be implemented by derived class');
    }

    async select(query) {
        //if (this.query.empty()) { throw new Error('DBTable::select - [this.query] is not set!'); }
        //
        this.#records = [];
        //
        if (_core.empty(query)) {
            query = null;
       }

        var rawResults = await this.db.exec(query || this.query.build());
        var _this = this;
        rawResults.each(function (res, idx) {
            _this.populate(res);
        });

        return _this.records.length > 0;
    }

}

DBTable.prototype.count = function (callback) {
    return this.records.length;
}

DBTable.prototype.each = function (callback) {
    _core.list.each(this.records, function (record, idx) {
        if (callback) {
            if (callback(record, idx) === false) { return false; }
        }
    });
}
DBTable.prototype.eachEx = function (callback) {
    _core.list.eachEx(this, this.records, function (record, idx, t) {
        if (callback) {
            if (callback(record, idx, t) === false) { return false; }
        }
    });
}

DBTable.prototype.find = function (filters) {
    var res = [];
    this.each(function (record, idx) {
        var filterIn = false;
        _core.list.each(filters, function (filter, idx) {
            
        });
        

    });
}

DBTable.prototype.create = function (defaults) {
    // NOTE: this.createNew is implemented on derived classes
    var record = this.createNew(defaults);
    this.records.push(record);
    return record;
}

DBTable.prototype.populate = function (defaults) {
    defaults.setUnchanged = true;
    return this.create(defaults);
}

DBTable.prototype.fetch = async function (id, returnNull) {
    if (!id) { throw new Error('DBTable::fetch - missing required argument [id]'); }
    var query = _cx_sql_utils.fetch(this.type, this.primaryKeys, id);
    var rawRecord = await this.db.exec(query);
    if (!rawRecord) {
        if (returnNull) { return null; }
        throw new Error(`${this.type} record [${id}] does not exist or was deleted!`);
    }
    return this.populate(rawRecord);
}

DBTable.prototype.fetchOrNew = async function (id) {
    if (id) {
        return await this.fetch(id);
    } else {
        return this.createNew();
    }
}

DBTable.prototype.first = function () {
    if (this.records.count == 0) { return null; }
    return this.records[0];
}

DBTable.prototype.last = function () {
    if (this.records.count == 0) { return null; }
    return this.records[this.records.count - 1];
}


DBTable.prototype.save = async function (options) {
    //
    if (!options) { options = { useTran: false, stopAtError: false }; }
    //
    var _this = this;
    if (options.useTran) {
        await this.db.begin(async function () {

            var errors = false;
            // NOTE: we need to use for-loops (not each) or we loose the scope
            for (var idx = 0; idx < _this.records.length; idx++) {
                try {
                    //if (_this.records[idx].id == 998) { throw new Error('test'); }
                    await _this.records[idx].save();
                } catch (error) {
                    _this.records[idx].error = error;
                    if (options.stopAtError) { throw error; }
                    errors = true;
                }
            }
            //
            if (errors) { throw new Error('one ore more records failed to save, sql transaction has been rolled back'); }
        });
    } else {

        var errors = false;
        for (var idx = 0; idx < _this.records.length; idx++) {
            try {
                //if (_this.records[idx].id == 998) { throw new Error('test'); }
                await _this.records[idx].save();
            } catch (error) {
                _this.records[idx].error = error;
                if (options.stopAtError) { throw error; }
                errors = true;
            }
        }
        if (errors) { throw new Error('one ore more records failed to save!'); }
    }

}






module.exports = DBTable;