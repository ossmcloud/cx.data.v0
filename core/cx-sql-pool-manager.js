'use strict'
// requires
const CXPool = require('./cx-sql-pool');
//const _cx_date = require('../../cx-core-date');
const _core = require('cx-core');

// pool collection
const _pools = new DBPoolCollection();
const _poolsGarbageCollectionFreqInMinutes = 10;        // DEPLOY: we probably want this less frequently (like every hour or so)
//
// SET RECURRING PROCESS TO CLOSE UNUSED POOLS
//
setInterval(function () {
    if (process.env.CX_POOL_LOG) { console.log(_core.date.formatEx() + ' - garbage collection...'); }
    _pools.garbageCollection();
}, (60000 * _poolsGarbageCollectionFreqInMinutes));
//
// THE POOL COLLECTION OBJECT
//
function DBPoolCollection() {
    this.getPool = async function (options) {
        // using unique name get existing pool (if any) or create a new one
        if (!options.name) { throw new Error('DBPoolCollection::getPool - missing required argument [options.name]'); }
        
        if (Object.prototype.hasOwnProperty.call(this, options.name)) {
            // DEV-LOG
            if (process.env.CX_POOL_LOG) { console.log('\x1b[36m', _core.date.formatEx() + ' - reusing pool: ' + this[options.name].name + ' [last used: ' + this[options.name].lastUsed + ']'); }
            // if we have the pool just refresh last used and return it
            this[options.name].lastUsed = new Date();
            this[options.name].useCount += 1;
        } else {
            // DEV-LOG
            if (process.env.CX_POOL_LOG) { console.log('\x1b[33m', _core.date.formatEx() + ' - opening pool: ' + options.name); }
            // create a new pool and connect
            var pool = new CXPool(this, options);
            await pool.connect();
            this[options.name] = pool;
        }
        return this[options.name];
    }

    this.garbageCollection = function (closeAll) {
        // close pools that have timed out
        return Promise.all(Object.values(this).map((pool) => {
            try {
                if (!pool.name) { return; }
                if (closeAll || pool.expired()) {
                    // DEV-LOG
                    if (process.env.CX_POOL_LOG) { console.log('\x1b[31m', _core.date.formatEx() + ' - closing pool: ' + pool.name + ((closeAll) ? ' - FORCED' : ' - TIME OUT\x1b[41m')); }
                    return pool.pool.close();
                } else {
                    // DEV-LOG
                    if (process.env.CX_POOL_LOG) { console.log(_core.date.formatEx() + ' - open pool: ' + pool.name + ' [last used: ' + pool.lastUsed + ']'); }
                }
            } catch (error) {
                // TODO: error handling
                console.log('cx-sql-pool-manager.garbageCollection ERROR:');
                console.log(error);
            }
        }));
    }
}

module.exports = {

    get: async function (options) {
        return await _pools.getPool(options);
    },

    countPools: function () {
        if (!_pools) { return 0; }
        var count = 0;
        for (const key in _pools) {
            if (!_pools.hasOwnProperty(key)) { continue; }
            var pool = _pools[key];
            if (!pool.name) { continue; }
            count++;
        }
        return count;
    },

    printPools: function () {
        var html = '<div class="cx-outer-container"><table class="jx-table"><thead><tr><th><b>pool name</b></th><th><b>db</b></th><th><b>use count</b></th><th><b>last used</b></th><th><b>on</b></th></tr></thead><tbody>'
        for (const key in _pools) {
            if (!_pools.hasOwnProperty(key)) { continue; }
            var pool = _pools[key];
            if (!pool.name) { continue; }
            html += '<tr>';
            html += '<td>' + pool.name + '</td>';
            html += '<td>' + pool.database + '</td>';
            html += '<td>' + pool.useCount + '</td>';
            html += '<td>' + _core.date.toNow(pool.lastUsed).toString() + '</td>';
            html += '<td>' + pool.lastUsed + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table></div>';
        return html;
    }

}