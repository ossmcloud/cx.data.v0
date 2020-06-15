'use strict'

const _cx_sql = require('./core/cx-sql-pool-manager');
const DBContext = require('./schema/cx-context');



module.exports = {
    DBContext: DBContext,
    getPool: _cx_sql.get,
}