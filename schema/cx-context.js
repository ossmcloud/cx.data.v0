'use strict'

const _core = require('cx-core');
const _cx_sql = require('../core/cx-sql-pool-manager');
const DBQueryResult = require('./cx-query-result');

//
// this represents the database context and stores the SQL pool to use
// the class should be extended on a derived class with specific database members 
//      (but it could be used standalone along with cx - sql - pool - manager)
//
class DBContext {
    #pool = null;               // the SQL pool
    #transaction = null;        // holds an instance of the sql transaction in use
    #schemaPath = null;         // provides the path where the table related modules are located, these are specific to each database
    #credentials = null;
    #roleId = null;
    constructor(pool, schemaPath, credentials) {
        // TODO: validate arguments
        this.#pool = pool;
        this.#schemaPath = schemaPath;
        this.#credentials = credentials;
        if (this.#schemaPath) {
            if (this.#schemaPath.substring(this.#schemaPath.length - 1, 1) != '/') {
                this.#schemaPath = this.#schemaPath + '/';
            }
        }
    }

    // read-only properties
    get pool() { return this.#pool; }
    get schemaPath() { return this.#schemaPath; }
    get transaction() { return this.#transaction; }
    get userId() {
        if (!this.#credentials) { return null; }
        return this.#credentials.userId;
    }
    get userEmail() {
        if (!this.#credentials) { return null; }
        return this.#credentials.username;
    }
    
    // NOTE: I need this function within the class because on DBContext.prototype this.#transaction does not work :(
    //       I do not want the #transaction property to be accessible in any way from outside the class
    async begin(callback) {

        if (!callback) { return; }
        if (this.transaction != null) { throw new Error('DBContext::begin - a transaction is already open!'); }
        // create sql transaction
        this.#transaction = this.pool.pool.transaction();

        try {
            // begin
            await this.transaction.begin();
            // do work
            await callback();
            // commit
            await this.transaction.commit();
        } catch (error) {
            // roll back and forward error
            await this.transaction.rollback();
            throw error;
        } finally {
            // clear property
            this.#transaction = null;
        }
    }

    

    async exec(query) {
        // validate arguments
        if (!query) { throw new Error('DBContext::exec - missing required argument [query]'); }
        if (!query.sql) { throw new Error('DBContext::exec - missing required argument [query.sql]'); }
        query.params = _core.list.toArray(query.params);
        // create sql query request from pool or from transaction object if there
        var request = (this.transaction) ? this.transaction.request() : this.pool.pool.request();
        // add parameters values
        query.params.forEach(p => {
            if (p.type) { request.input(p.name, p.type, p.value); }
            else { request.input(p.name, p.value); }
        });
        // execute query and create result object
        var rawResult = await request.query(query.sql);
        // 
        var result = new DBQueryResult(rawResult);
        // check if query specifies specific behaviour for queries that affected no rows (i.e.: inserts or updates)
        if (result.rowsAffected == 0) {
            if (query.noRowsAffected) {
                if (query.noRowsAffected == 'return null' || query.noRowsAffected == 'null') { return null; }
                throw new Error(query.noRowsAffected);
            }
        }
        // check if query specifies specific behaviour for no result
        if (result.count == 0) {
            if (query.noResult) {
                if (query.noResult == 'return null' || query.noResult == 'null') { return null; }
                throw new Error(query.noResult);
            }
        }
        // check if query specifies to return 1st record only
        if (query.returnFirst) { return result.first(); }
        // otherwise return result object
        return result;
    }



    static async getContext(config) {
        var db_pool = await _cx_sql.get(config);
        return new DBContext(db_pool);
    }
}


// creates a table instance object
DBContext.prototype.table = function (tableName) {
    try {
        if (!this.schemaPath) { throw new Error('DBContext::table - missing required property [this.schemaPath]'); }
        if (!tableName) { throw new Error('DBContext::table - missing required argument [recordType]'); }
        tableName = tableName.TBL_NAME || tableName;
        if (!tableName) { throw new Error('DBContext::table - missing required argument [recordType]'); }
        const DBTable = require(this.schemaPath + tableName);
        var table = new DBTable.Table();
        table.cx = this;
        return table;   
    } catch (error) {
        // TODO: better error handling if module not there
        throw error;
    }    
}

// create a record (wraps the table function)
DBContext.prototype.create = function (tableName, defaults) {
    return this.table(tableName).create(defaults);
}

// fetch a record (wraps the table function)
DBContext.prototype.fetch = async function (tableName, id) {
    return await this.table(tableName).fetch(id);
}

// select records from query (wraps the table function)
DBContext.prototype.select = async function (tableName, query) {
    // TODO: 
}

module.exports = DBContext;