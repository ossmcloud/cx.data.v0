'use strict'

const _core = require('cx-core');
const _cx_sql_utils = require('./cx-record-tsql');
const DBRecordQuery = require('./cx-record-query');
const { truncateSync } = require('fs');


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

    setRecords(records) {
        this.#records = records;
    }

    async select(query) {
        //
        var _this = this;
        this.#records = [];
        if (_core.empty(query)) { query = null; }

        query = query || this.query.build();

        if (query.paging && !query.sqlCount) {
            try {
                var sql = query.sql.toLowerCase().indexOf(' from ' + this.type);
                if (sql > 0) {
                    var sqlOrder = query.sql.toLowerCase().indexOf('order by');
                    if (sqlOrder < 0) { sqlOrder = query.sql.length; }
                    query.sqlCount = 'select count(*) as recordCount ' + query.sql.substr(sql, sqlOrder - sql);
                }
            } catch (error) {
                // ignore issue here, don't want to stop for this only
            }
        }
        
        var rawResults = await this.db.exec(query);
        rawResults.each(function (res, idx) { _this.populate(res); });

        if (query.paging && query.sqlCount) {
            try {
                query.sql = query.sqlCount;
                query.returnFirst = true;
                query.paging = false;
                var rawResults = await this.db.exec(query);
                this.records.count = rawResults.recordCount;
            } catch (error) {
                // ignore issue here, don't want to stop for this only
                //console.log(error);
            }
        }
        
        return this.records.length > 0;
    }

    queryFromParams(query, params, tableAlias, callback) {
        if (tableAlias === undefined) { tableAlias = ''; }
        if (tableAlias) { tableAlias = tableAlias + '.'; }
        for (var paramName in params) {
            if (paramName == 'page') { continue; }
            if (paramName == 'noPaging') { continue; }
            if (paramName.indexOf('SKIP') == 0) {
                continue;
            }
            if (!params[paramName]) { continue; }

            var fieldName = paramName;
            if (fieldName == 's') { fieldName = 'shopId'; }
            var isToFilter = paramName.substring(paramName.length - 2) == 'To';
            var hasToFilter = (isToFilter) ? (params[paramName.substring(0, paramName.length - 2)] != undefined) : (params[paramName + 'To'] != undefined);
            
            var paramValue = params[paramName];
            if (!query.params) { query.params = []; }
            
            if (isToFilter) { fieldName = fieldName.substring(0, paramName.length - 2); }
            // if (fieldName.indexOf('.') > 0) {
            //     fieldName = fieldName.substring(fieldName.indexOf('.')+1);
            // }
            if (this.fields[fieldName]) {
                var field = this.fields[fieldName];
                var operator = '=';
                

                var fieldSqlName = `${tableAlias}${fieldName}`;
                if (field.dataType == 'datetime' || field.dataType == 'date' || field.dataType == 'int' || field.dataType == 'bigint' || field.dataType == 'money') {
                    if (hasToFilter) {
                        operator = (isToFilter) ? '<=' : '>=';
                    }
                } else if (field.dataType == 'bit') {
                    paramValue = paramValue.toLowerCase();
                    paramValue = (paramValue == 't' || paramValue == 'true' || paramValue == 'y' || paramValue == 'yes' || paramValue == 'on' || paramValue == '1') ? '1' : '0';
                    fieldSqlName = `isnull(${fieldSqlName}, 0)`;
                } else if (field.dataType == 'varchar') {
                    operator = 'like';
                    if (paramValue[paramValue.length - 1] != '%') {
                        paramValue = `${paramValue}%`;
                    }
                }

                if (callback && callback({ paramName: paramName, fieldName: fieldName, isToFilter: isToFilter, operator: operator }) === false) { continue; }

                query.sql += ` and ${fieldSqlName} ${operator} @${paramName}`;

                
                query.params.push({ name: paramName, value: paramValue });
            } else {
                query.sql += ` and ${fieldName} = @${paramName.replace('.','_')}`;
                query.params.push({ name: paramName.replace('.', '_'), value: paramValue });
            }
        }

    }


}

DBTable.prototype.count = function () {
    return this.records.length;
}

DBTable.prototype.each = function (callback) {
    _core.list.each(this.records, function (record, idx) {
        if (callback) {
            if (callback(record, idx) === false) { return false; }
        }
    });
}
DBTable.prototype.eachAsync = async function (callback) {
    if (!callback) { return; }
    for (var idx = 0; idx < this.records.length; idx++) {
        var res = await callback(this.records[idx], idx);
        if (res === false) { return false; }
    }
}
DBTable.prototype.eachEx = function (callback) {
    _core.list.eachEx(this, this.records, function (record, idx, t) {
        if (callback) {
            if (callback(record, idx, t) === false) { return false; }
        }
    });
}

DBTable.prototype.find = function (callback) {
    var res = [];
    this.each(function (record, idx) {
        if (callback(record, idx) === true) {
            res.push(record);
        }
    });
    return res;
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

DBTable.prototype.delete = async function (id, noErrorIfNotFound) {
    if (!id) { throw new Error('DBTable::delete - missing required argument [id]'); }
    var query = _cx_sql_utils.delete(this.type, this.primaryKeys, id);
    var queryRes = await this.db.exec(query);
    if (queryRes.rowsAffected==0) {
        if (noErrorIfNotFound) { return; }
        throw new Error(`${this.type} record [${id}] does not exist or was deleted!`);
    }
    return;
}


DBTable.prototype.lookUp = async function (id, fieldNames) {
    if (!fieldNames) { return null; }
    if (!Array.isArray(fieldNames)) { fieldNames = [fieldNames]; }

    var sql = 'select ' + fieldNames[0];
    _core.list.each(fieldNames, function (fieldName, idx) {
        if (idx > 0) {
            sql += `, ${fieldName}`;
        }
    });
    // @@TODO: @@MULTI-PK: fix for multi pks
    sql += ` from ${this.type} where ${this.primaryKeys[0].name} = @${this.primaryKeys[0].name}`;

    var query = {
        sql: sql, noResult: 'null', returnFirst: true,
        params: [{ name: this.primaryKeys[0].name, value: id }]
    }

    var res = await this.db.exec(query);
    if (fieldNames.length == 1 && res) { return res[fieldNames[0]]; }
    return res;
}

DBTable.prototype.fetchOrNew = async function (id) {
    if (id) {
        var rec = await this.fetch(id);
        if (rec) { return rec; }
        return this.createNew();
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