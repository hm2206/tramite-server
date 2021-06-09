'use strict';

const File = use('App/Models/File');
const Env = use('Env');
const Drive = use('Drive');
const Helpers = use('Helpers');
const { validation, Storage } = require('validator-error-adonis');
const DBException = require('../Exceptions/DBException');
const { LINK } = require('../../utils');

class FileEntity {

    attributes = {
        name: "",
        object_id: "",
        object_type: "",
        extname: "",
        size: "",
        url: "",
        real_path: "",
        tag: "",
        observation: ""
    }

    async store (request, info = { object_type: "", object_id: "", extnames: [] }, dir = null, trx = null) {
        await validation(null, info, {
            object_type: "required",
            object_id: "required",
            extnames: "array",
        });
        // obtener ruta destino
        let current_path = dir || `${info.object_type.split('/').pop()}/${uid(10)}`.toLowerCase();
        // procesar archivos temporales
        let tmpFile = await Storage.saveFile(request, 'files', {
            multifiles: true,
            required: true,
            size: Env.get('DRIVE_SIZE', '6mb'),
            extnames: info.extnames,
        }, Helpers, {
            path: current_path,
            options: {
                overwrite: true
            }
        });
        // preparar datos
        let payload = [];
        await tmpFile.files.map(f => {
            payload.push({
                name: f.name,
                object_id: info.object_id,
                object_type: info.object_type,
                extname: f.extname,
                size: f.size,
                url: LINK("tmp", f.path),
                real_path: f.realPath
            });
        });
        // procesar creación de archivos
        try {
            // guardar archivos
            let files = await File.createMany(payload, trx);
            files = JSON.parse(JSON.stringify(files));
            return files;
        } catch (error) {
            // eliminar archivo
            for (let currentFile of payload) {
                let existsFile = await Drive.exists(currentFile.real_path);
                if (!existsFile) continue;
                await Drive.delete(currentFile.real_path);
            }
            // emitir error
            throw new DBException(error, "regístros");
        }
    }

}

module.exports = FileEntity;