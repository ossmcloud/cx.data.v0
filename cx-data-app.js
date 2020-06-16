'use strict'

const _cx_sql = require('./core/cx-sql-pool-manager');
const builderPlugin = require('./builder/obj-builder-plugin');

const DBContext = require('./schema/cx-context');
const DBRecord = require('./schema/cx-record');
const DBTable = require('./schema/cx-record-table');


module.exports = {
    DBContext: DBContext,
    DBRecord: DBRecord,
    DBTable: DBTable,

    getPool: _cx_sql.get,
    builder: builderPlugin,
}