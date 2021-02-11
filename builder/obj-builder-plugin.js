'use strict'

const _path = require('path');
const _fs = require('fs');
const _core = require('cx-core');

let _poolConfig = null;

exports.plugin = {
    name: 'obj-builder',
    register: async function (server, options) {
        _poolConfig = options;
      
        server.route({
            method: 'GET',
            path: '/build/{any*}',
            handler: async (request, h) => {
                //if (process.env.DEV === "false") {
                if (process.env.DEV_TOOLS != 'T') { throw new Error('Not Authorised!'); }
                //}

                _poolConfig.config.database = (request.query.m || request.params.any == 'm') ? _poolConfig.config.masterDb : _poolConfig.config.clientDb;
                _poolConfig.name = 'cx_builder_' + _poolConfig.config.database;

                const _object_builder = require('./obj-builder').init(_poolConfig);

                if (!request.query.table) {
                    var str = _fs.readFileSync(_path.join(__dirname, 'obj-builder.html'), 'utf8');
                    var tableList = await _object_builder.renderTableList();
                    str = str.replace('{$tableList}', tableList);
                    return h.response(str);
                } else {
                    var builtObject = await _object_builder.build(request.query.table, request.query.b);
                    return h.response(builtObject).header('Content-Type', 'text/plain');
                }
            }
        });

    }
}