'use strict'

//const _core.list = require('../../cx-core');
const _core = require('cx-core');

const _rowVersionFieldName = 'rowver';

function _insert(dbRecord) {
    var query = { sql: '', params: [] };

    var sqlInsert = 'insert into [' + dbRecord.table.type + '] (';
    var sqlValues = 'values (';

    _core.list.eachProp(dbRecord.table.fields, function (key, field) {
        // ignore identity keys
        if (field.identity) { return true; }
        // build sql insert statement and values statement
        sqlInsert += (key + ',');
        sqlValues += ('@' + key + ',');
        // add parameters
        query.params.push({ name: key, value: dbRecord[key], });
    });

    // concatenate the scripts (NOTE: need to remove last comma)
    query.sql = _core.text.trimRight(sqlInsert, ',') + ') ' + _core.text.trimRight(sqlValues, ',') + ')';

    // return primary key
    if (dbRecord.table.primaryKeys[0].identity) {
        query.sql += ' select SCOPE_IDENTITY() as [id]';
    } else {
        // @@TODO: @@MULTI-PK: return comma separated list of ids
        query.sql += ' select @' + dbRecord.table.primaryKeys[0].name + ' as [id]';
    }
    //
    query.noRowsAffected = 'Record could not be inserted!!!';
    query.returnFirst = true;
    //
    return query;
}

function _update(dbRecord) {
    var query = { sql: '', params: [] };
    query.sql = 'update [' + dbRecord.table.type + '] set ';
    // loop field and add the update for the field only if it is dirty
    _core.list.eachProp(dbRecord.fields, function (key, field) {
        if (field.dirty) {
            if (!field.pk) {
                query.sql += '[' + key + '] = @' + key + ',';
                query.params.push({ name: key, value: dbRecord[key] });
            }
        }
    });


    // remove last comma
    query.sql = _core.text.trimRight(query.sql, ',');

    //
    for (var pkx = 0; pkx < dbRecord.table.primaryKeys.length; pkx++) {
        var pk = dbRecord.table.primaryKeys[pkx];
        query.sql += ((pkx == 0) ? ' where ' : ' and ');
        query.sql += '[' + pk.name + '] = @' + pk.name;
        query.params.push({ name: pk.name, value: dbRecord[pk.name] });
    }

    // OPTIMISTIC CONCURRENCY - table must have the rowVersion column (name: rowver)
    if (dbRecord.rowVersion) {
        
        query.sql += ' and ' + _rowVersionFieldName + ' = CONVERT(BINARY(8), @' + _rowVersionFieldName + ', 1)';
        query.params.push({ name: _rowVersionFieldName, value: dbRecord.rowVersion });
    }

    // @@TODO: @@MULTI-PK: return comma separated list of ids
    query.sql += ' select @' + pk.name + ' as [id]';
    //
    query.noRowsAffected = 'the record has been edited or deleted by another user!';
    query.returnFirst = true;

    return query;
}

function _save(dbRecord) {
    if (!dbRecord) { throw new Error('DBUtils::_save - missing required argument [dbRecord]'); }
    if (dbRecord.isNew()) { return _insert(dbRecord); }
    return _update(dbRecord);
}


function _fetch(recordType, primaryKeys, ids) {
    if (!recordType) { throw new Error('DBUtils::_fetch - missing required argument [recordType]'); }

    ids = _core.list.toArray(ids);
    primaryKeys = _core.list.toArray(primaryKeys);

    if (ids.length == 0) { throw new Error('DBUtils::_fetch - missing required argument [ids]'); }
    if (primaryKeys.length == 0) { throw new Error('DBUtils::_fetch - missing required argument [primaryKeys]'); }
    if (ids.length != primaryKeys.length) { throw new Error('DBUtils::_fetch - invalid arguments [primaryKeys] and [ids] must contain same number of items'); }

    var query = { sql: '', params: [] };
    query.sql = 'select * from [' + recordType + ']';

    for (var pkx = 0; pkx < primaryKeys.length; pkx++) {
        var pk = primaryKeys[pkx];
        //
        query.sql += ((pkx == 0) ? ' where ' : ' and ');
        query.sql += '[' + pk.name + '] = @' + pk.name;
        //
        query.params.push({ name: pk.name, value: ids[pkx] });
    }

    query.noResult = 'null';
    query.returnFirst = true;

    return query;
}


function _delete(recordType, primaryKeys, ids) {
    if (!recordType) { throw new Error('DBUtils::_delete - missing required argument [recordType]'); }

    ids = _core.list.toArray(ids);
    primaryKeys = _core.list.toArray(primaryKeys);

    if (ids.length == 0) { throw new Error('DBUtils::_delete - missing required argument [ids]'); }
    if (primaryKeys.length == 0) { throw new Error('DBUtils::_delete - missing required argument [primaryKeys]'); }
    if (ids.length != primaryKeys.length) { throw new Error('DBUtils::_delete - invalid arguments [primaryKeys] and [ids] must contain same number of items'); }

    var query = { sql: '', params: [] };
    query.sql = 'delete from [' + recordType + ']';

    for (var pkx = 0; pkx < primaryKeys.length; pkx++) {
        var pk = primaryKeys[pkx];
        //
        query.sql += ((pkx == 0) ? ' where ' : ' and ');
        query.sql += '[' + pk.name + '] = @' + pk.name;
        //
        query.params.push({ name: pk.name, value: ids[pkx] });
    }

    // query.noResult = 'null';
    // query.returnFirst = true;

    return query;
}





module.exports = {
    save: _save,
    fetch: _fetch,
    delete: _delete,

    get RowVersionFieldName() {
        return _rowVersionFieldName;
    }
}