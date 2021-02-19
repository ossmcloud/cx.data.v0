'use strict'

class DBQueryResult {
    #raw = null;
    #rows = null;
    #count = 0;
    #rowsAffected = 0;
    #subResults = [];
    constructor(result) {
        this.#raw = result;
        this.#rows = result.recordset;
        this.#count = (result.recordset) ? result.recordset.length : 0;
        this.#rowsAffected = result.rowsAffected[0] || 0;

        if (result.recordsets) {
            for (var rx = 1; rx < result.recordsets.length; rx++) {
                this.#subResults.push(new DBQueryResult({
                    recordset: result.recordsets[rx],
                    rowsAffected: [result.rowsAffected[rx]]
                }));
            }
        }
    }

    get raw() { return this.#raw; }
    get rows() { return this.#rows; }
    get count() { return this.#count; }
    get rowsAffected() { return this.#rowsAffected; }
    get subResults() { return this.#subResults; }

   
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