'use strict'

class DBQueryResult {
    #raw = null;
    #rows = null;
    #count = 0;
    #rowsAffected = 0;
    constructor(result) {
        // TODO: validate arguments
        this.#raw = result;
        this.#rows = result.recordset;
        this.#count = (result.recordset) ? result.recordset.length : 0;
        this.#rowsAffected = result.rowsAffected[0] || 0;
    }

    get raw() { return this.#raw; }
    get rows() { return this.#rows; }
    get count() { return this.#count; }
    get rowsAffected() { return this.#rowsAffected; }
   
}

DBQueryResult.prototype.first = function () {
    if (this.count == 0) { return null; }
    return this.rows[0];
}

DBQueryResult.prototype.last = function () {
    if (this.count == 0) { return null; }
    return this.rows[this.count - 1];
}

DBQueryResult.prototype.each = function (callback) {
    if (!callback) { return; }
    for (var idx = 0; idx < this.count; idx++) {
        var res = callback(this.rows[idx], idx);
        if (res === false) { break; }
    }
}



module.exports = DBQueryResult;