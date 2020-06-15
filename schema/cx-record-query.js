'use strict'

//const _cx_core = require('../../cx-core');
const _core = require('cx-core');

class DBRecordQuery {
    #type = null;
    #columns = [];
    #filters = [];
    #orderBy = [];
    constructor(tableName) {
        // TODO: validate arguments
        this.#type = tableName;
    }

    // read-only
    get type() { return this.#type; }
    get columns() { return this.#columns; }
    get filters() { return this.#filters; }
    get orderBy() { return this.#orderBy; }

    clear() {
        this.clearColumns();
        this.clearFilters();
    }
    clearColumns() {
        this.#columns = [];
        this.clearOrderBy();
    }
    clearFilters() {
        this.#filters = [];
    }
    clearOrderBy() {
        this.#orderBy = [];
    }

    empty() {
        return (this.columns.length + this.filters.length + this.orderBy.length) == 0;
    }

    addColumn(options) {
        // make sure column not already in collection
        var name = options.name || options;
        if (_core.list.findInArray(this.columns, 'name', name)) { throw new Error('DBQuery::addColumn - a column for same field [' + name + '] has already been added to the query column collection'); }
        var column = new DBRecordQueryColumn(options);
        this.columns.push(column);
        return column;
    }

    addFilter(options) {
        var filter = new DBRecordQueryFilter(options);
        this.filters.push(filter);
        return filter;
    }

    addOrderBy(name, direction) {
        var ordBy = _core.list.findInArray(this.orderBy, 'name', name);
        if (!ordBy) { return ordBy; }
        ordBy = new DBRecordQueryOrderBy(name, direction);
        this.orderBy.push(ordBy);
        return ordBy;
    }

    build() {
        var query = { sql: '', params: [] };
        query.sql = 'select ';
        if (this.columns.length == 0) { this.addColumn('*'); }

        var _this = this;
        _core.list.each(this.columns, function (col, cx) {
            if (cx > 0) { query.sql += ','; }
            query.sql += col.name;
            if (col.alias) { query.sql += (' as [' + col.alias + ']'); }
            if (col.sort) { _this.addOrderBy(col.name, col.sort); }
        });
        query.sql += (' from ' + this.type);
        _core.list.each(this.filters, function (fil, fx) {
            query.sql += (fx == 0) ? ' where ' : ' and ';
            query.sql += (fil.name + ' ' + fil.operator + ' @' + fil.name);
            query.params.push({
                name: fil.name,
                value: fil.value,
            });
        });
        if (this.orderBy.length > 0) { query.sql += ' order by '; }
        _core.list.each(this.orderBy, function (ordBy, ox) {
            if (ox > 0) { query.sql += ','; }
            query.sql += (ordBy.name + ' ' + ordBy.direction);
        });
        return query;
    }
}




class DBRecordQueryFilter {
    #name = null;
    #operator = null;
    #value = null;
    constructor(options) {
        if (!options) { throw new Error('DBQueryFilter::construct - missing required argument [options]'); }
        if (!options.name) { throw new Error('DBQueryFilter::construct - missing required argument [options.name]'); }
        if (options.value === undefined) { throw new Error('DBQueryFilter::construct - missing required argument [options.value]'); }

        this.#name = options.name;
        this.#operator = options.operator || options.op || '=';
        this.#value = options.value;
    }

    get name() { return this.#name; }
    get operator() {
        return this.#operator;
    } set operator(val) {
        this.#operator = val || '=';
    }
    get value() {
        return this.#value;
    } set value(val) {
        this.#value = val;
    }

}


class DBRecordQueryColumn {
    #name = null;
    #sort = null;
    #alias = null;
    constructor(options) {
        if (!options) { throw new Error('DBQueryColumn::construct - missing required argument [options]'); }
        if (typeof options === 'string') { options = { name: options }; }
        if (!options.name) { throw new Error('DBQueryColumn::construct - missing required argument [options.name]'); }

        this.#name = options.name;
        this.#sort = options.sort || 'ASC';
        this.#alias = options.alias || null;
    }
    
    //
    get name() { return this.#name; }
    get sort() { return this.#sort; }
    get alias() { return this.#alias; }
}

class DBRecordQueryOrderBy {
    #name = null;
    #direction = null;
    constructor(name, direction = 'ASC') {
        this.#name = name;
        this.#direction = direction;
    }

    get name() { return this.#name; }
    get direction() {
        return this.#direction;
    } set direction(val) {
        this.#direction = val || 'ASC';
    }
}




module.exports = DBRecordQuery