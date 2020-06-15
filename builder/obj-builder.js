'use strict';

const _fs = require('fs');
const _cx_context = require('../schema/cx-context');

// needed to build persistent object class
//  NOTE (RANT AHEAD!): the useless Microsoft sys table system does not allow me to get data in a straight forward manner because they are a bunch of morons and spread critical info across multiple stupid bloody tables
const _sql_get_table_cols = `
        select	c.[name], c.max_length, c.is_nullable, c.is_identity, 
                (select DATA_TYPE from INFORMATION_SCHEMA.COLUMNS def where def.TABLE_NAME = t.[Name] and def.COLUMN_NAME = c.[name]) as dataType,
                (select COLUMN_DEFAULT from INFORMATION_SCHEMA.COLUMNS def where def.TABLE_NAME = t.[Name] and def.COLUMN_NAME = c.[name])  as defaultValue,
                (SELECT 1 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + QUOTENAME(CONSTRAINT_NAME)), 'IsPrimaryKey') = 1 AND TABLE_NAME = t.[name]  and COLUMN_NAME=c.[name]) as primaryKey
        from	sys.columns c, sys.tables t
        where	c.object_id = t.object_id
        and		t.[name] = @tableName
        order by c.column_id
`;
// needed to build the database schema
const _sql_get_table_and_fields_names = `
        select		TABLE_NAME, COLUMN_NAME
        from		INFORMATION_SCHEMA.COLUMNS
        where		TABLE_SCHEMA <> 'sys'
        and         COLUMN_NAME <> 'rowver'
        order by	TABLE_NAME, ORDINAL_POSITION
`;
// needed by the UI to show table list
const _sql_get_table_names = `
        select		TABLE_NAME
        from		INFORMATION_SCHEMA.TABLES
        where		TABLE_SCHEMA <> 'sys'
        order by	TABLE_NAME
`;
// used by the rendering function
const _html_table_list_item = `
    <div style="padding: 11px;">
        <div class="p" style="display: inline-block; vertical-align: bottom;">
            <input id="p_{$id}" type="checkbox" value="{$tableName}" style="margin-right: 7px;" />
        </div>
        <div class="b" style="display: inline-block; vertical-align: bottom;">
            <input  id="b_{$id}" type="checkbox" style="margin-right: 7px;" />
        </div>
        <span style="display: inline-block; padding-bottom: 2px;">{$tableName}</span>
    </div>
`;
// database configuration
let _config = null;

// util function
String.prototype.replaceAll = function (search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

/*
async function _getTableList() {
    // connect to server and retrieve the table's columns properties 
    var db = await _cx_context.getContext(_config);
    var tables = await db.exec({
        sql: _sql_get_table_names
    });
    var tables = [];
    tables.each(function (table, idx) {
        tables.push({
            tableName: table.TABLE_NAME
        });
    });
    return tables;
}
*/

async function _renderTableList() {
    // this function is used by interface to list tables
    var db = await _cx_context.getContext(_config);
    var tables = await db.exec({
        sql: _sql_get_table_names
    });
    var html = '';
    tables.each(function (table, idx) {
        var element = (_html_table_list_item.replaceAll('{$tableName}', table.TABLE_NAME));
        element = element.replaceAll('{$id}', idx);
        html += element;

    });
    return html;
}

async function _buildSchema() {
    // this function builds the table schema as a list of objects with TBL_NAME and field names as properties
    // the schema is useful for the intelli-sense and other things such as building queries and stuff
    var db = await _cx_context.getContext(_config);
    var columns = await db.exec({
        sql: _sql_get_table_and_fields_names
    });
    var jsCode = "'use strict'\n\n";
    jsCode += 'module.exports = {\n';
    var currentTableName = '';
    columns.each(function (column, idx) {
        if (currentTableName != column.TABLE_NAME) {
            if (currentTableName) { jsCode += "    },\n\n"; }
            currentTableName = column.TABLE_NAME;
            jsCode += "    " + currentTableName + ": {\n";
            jsCode += "        TBL_NAME: '" + column.TABLE_NAME + "',\n";
        }
        jsCode += "        " + column.COLUMN_NAME.toUpperCase() + ": '" + column.COLUMN_NAME + "',\n";
        
    });
    jsCode += "    }\n\n";
    jsCode += '}\n';
    return jsCode;
}

async function _build(tableName) {
    // connect to server and retrieve the table's columns properties 
    var db = await _cx_context.getContext(_config);
    var columns = await db.exec({
        sql: _sql_get_table_cols,
        params: [{ name: 'tableName', value: tableName }]
    });

    // load template file for persistent object
    var jsCode = _fs.readFileSync('./src/cx/data/builder/obj-builder-p-template.txt', 'utf8');
    // table name
    jsCode = jsCode.replaceAll('{$tableName}', tableName);
    // table field names
    var fieldNames = '';
    var fieldDeclarations = '';
    var fieldPropertyDeclarations = '';
    columns.each(function (column, idx) {
        // we don't want to show this field anywhere
        if (column.dataType == 'timestamp') { return true; }

        // field names 
        fieldNames += "    " + column.name.toUpperCase() + ": '" + column.name + "',\n"; 

        // table fields declarations
        var defaultValue = column.defaultValue || '';
        if (defaultValue.indexOf('getdate()') >= 0) { defaultValue = 'now'; }
        if (defaultValue) { defaultValue = ", default: '" + defaultValue + "'"; }
        fieldDeclarations += "    " + column.name + ": { name: '" + column.name + "', dataType: '" + column.dataType + "'";
        fieldDeclarations += ", pk: " + (column.primaryKey == '1') + ", identity: " + (column.is_identity == '1');
        fieldDeclarations += ", maxLength: " + column.max_length + ", null: " + (column.is_nullable == '1') + defaultValue + " },\n"

        // we do not want fields that are common to most tables
        if (column.name == 'timeStamp' || column.name == 'created' || column.name == 'createdBy' || column.name == 'modified' || column.name == 'modifiedBy') { return true; }

        // table fields property declarations
        var fieldProperty = '';
        fieldProperty += '    get ' + column.name + '() {\n';
        fieldProperty += '        return super.getValue(_fieldNames.' + column.name.toUpperCase() + ');\n';
        if (!column.is_identity) {
            fieldProperty += '    } set ' + column.name + '(val) {\n';
            fieldProperty += '        super.setValue(_fieldNames.' + column.name.toUpperCase() + ', val);\n';
        }
        fieldProperty += '    }\n\n';
        fieldPropertyDeclarations += fieldProperty;
    });

    // merge
    jsCode = jsCode.replaceAll('{$tableFieldNames}', fieldNames);
    jsCode = jsCode.replaceAll('{$tableFields}', fieldDeclarations);
    jsCode = jsCode.replaceAll('{$tableProperties}', fieldPropertyDeclarations);

    return jsCode;
}

async function _build_b(tableName) {
    // the business object is generally created only ne and is very simple as it is
    // designed to hold all record-related business rules
    var jsCode = _fs.readFileSync('./src/cx/data/builder/obj-builder-b-template.txt', 'utf8');
    jsCode = jsCode.replaceAll('{$tableName}', tableName);
    return jsCode;
}


module.exports = {
    init: function (config) {
        _config = config; 
        return this;
    },

    build: async function (tableName, b) {
        if (b) {
            return _build_b(tableName);
        } else {
            if (tableName.toLowerCase() == 'schema') {
                return _buildSchema();
            } else {
                return _build(tableName);
            }
        }
    },

    renderTableList: _renderTableList,
}