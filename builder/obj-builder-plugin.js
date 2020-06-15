'use strict'

//const Path = require('path');
const _fs = require('fs');

const _object_builder = require('./obj-builder').init({
    name: 'cx_0',
    timeOut: 1,
    config: {
        server: 'ilaokw62nb.database.windows.net',
        user: 'envisageSQL',
        password: '3nv15ag3!',
        database: 'cx.client.b'
    }
});

exports.plugin = {
    name: 'obj-builder',
    register: async function (server, options) {
        server.route({
            method: 'GET',
            path: '/build',
            handler: async (request, h) => {
                if (process.env.DEV === "false") { throw new Error('Not Authorised!'); }
                if (!request.query.table) {
                    var str = _fs.readFileSync('./src/cx/data/builder/obj-builder.html', 'utf8');
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