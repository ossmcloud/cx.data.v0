'use strict'
// requires
const _sql = require('mssql');
//const _cx_date = require('../../cx-core-date');
const _core = require('cx-core');
//
// THE POOL OBJECT
//
class DBPool {
    // private declarations
    #name = null;
    #database = null;
    #schemaPath = null;
    #timeOut = null;
    #lastUsed = null;
    #useCount = 0;
    #pool = null;
    #config = {};
    #pools = [];
    //
    constructor(pools, options) {
        // validate parameters
        if (!pools) { throw new Error('DBPool::construct - missing required argument [options.pools]'); }
        if (!options.name) { throw new Error('DBPool::construct - missing required argument [options.name]'); }
        if (!options.config) { throw new Error('DBPool::construct - missing required argument [options.config]'); }
    
        // set object properties
        this.#pools = pools;
        this.#config = options.config;
        this.#name = options.name;
        this.#database = options.config.database;
        this.#schemaPath = options.schemaPath;
        this.#timeOut = options.poolTimeOutInMinutes || options.timeOut || 720;
        this.#lastUsed = new Date();
        this.#useCount = 1;
        this.#pool = null;
    }

    // public read-only properties
    get name() { return this.#name; }
    get database() { return this.#database; }
    get schemaPath() { return this.#schemaPath; }
    get timeOut() { return this.#timeOut; }
    get pool() { return this.#pool; }

    // public writable properties
    get lastUsed() {
        return this.#lastUsed;
    } set lastUsed(val) {
        this.#lastUsed = val;
    }

    get useCount() {
        return this.#useCount;
    } set useCount(val) {
        this.#useCount = val;
    }

    //
    async connect() {
        if (this.#pool !== null) { return; }
        // create pool
        this.#pool = new _sql.ConnectionPool(this.#config);
        // bind close function
        const close = this.#pool.close.bind(this.#pool);
        this.#pool.close = () => {
            // remove pool from array and close connection
            delete this.#pools[this.#name];
            return close();
        };
        // TODO: error handling
        this.#pool.on('error', function (err) {
            console.log(err);
        });
        // connect pool 
        await this.#pool.connect();
        // TODO: two very close requests could come here and open the pool twice
        if (this.#pools[this.#name] != null) { 

        }
    }

    // check if the pool has not been used for more than the time out
    expired() {
        return (_core.date.toNow(this.lastUsed).minutes > this.timeOut);
    }


}



module.exports = DBPool