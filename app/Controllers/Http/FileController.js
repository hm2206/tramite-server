'use strict'

const Helpers = use('Helpers');
const Drive = use('Drive');
const p = require('path');
const { Storage, validation } = require('validator-error-adonis');
const uid = require('uid');
const contentDisposition = require('content-disposition');
const { LINK } = require('../../../utils');
const File = use('App/Models/File');
const { validateAll } = use('Validator');
const CustomException = require('../../Exceptions/CustomException')
const NotFoundModelException = require('../../Exceptions/NotFoundModelException');
const Env = use('Env');


class FileController {

    allow = [
        'App/Models/Tramite',
        'App/Models/Info'
    ];

    // crear archivo
    store = async ({ request, trx = null }) => {
        let catchRequest = {
            object_type: request.input('object_type', request.object_type || ""),
            object_id: request.input('object_id', request.object_id || "")
        };
        // validación
        await validation(validateAll, catchRequest, {
            object_type: 'required',
            object_id: 'required',
        });
        // request
        let { object_id, object_type } = catchRequest;
        // validar objecto
        if (!this.allow.includes(object_type)) throw new CustomException("El objecto no está permitido!", "ERR_NOT_ALLOW_OBJECT", 403)
        let Object = use(object_type);
        let obj = request.object_file ? request.object_file : await Object.find(object_id, trx);
        if (!obj) throw new NotFoundModelException("El objecto");
        let folder = `${object_type.split('/').pop()}`.toLowerCase();
        let dir = uid(10);
        if (catchRequest.object_type == 'App/Models/Tramite') {
            dir = obj.slug;
        }
        // archivo
        let file = await Storage.saveFile(request, "files", {
            multifiles: true,
            required: true,
            size: Env.get('DRIVE_SIZE', '6mb'),
            extnames: ['pdf', 'docx', 'doc', 'zip', 'rar', 'PDF', 'DOCX', 'DOC', 'ZIP', 'RAR'],
        }, Helpers, {
            path: `${folder}/${dir}`,
            options: {
                overwrite: true
            }
        })
        // precargar datos
        let payload = [];
        await file.files.map(f => {
            payload.push({
                name: f.name,
                object_id,
                object_type,
                extname: f.extname,
                size: f.size,
                url: LINK("tmp", f.path),
                real_path: f.realPath
            });
        });
        // crear files
        let files = await File.createMany(payload);
        files = JSON.parse(JSON.stringify(files));
        // response
        return { 
            success: true,
            status: 201,
            message: "El archivo se guardo correctamente!",
            files
        }
    }

    // obtener archivo
    handle = async ({ request, response }) => {
        let disk = request.input('disk', 'tmp');
        let path = request.input('path');
        if (!path) throw new Error("La ruta es obligatoria");
        let link = Helpers.appRoot(p.join(disk, path));
        let exists = await Drive.exists(link);
        if (!exists) throw new Error("No se encontró el archivo");
        let name = `${path}`.split('/').pop();
        response.header('Content-Disposition', contentDisposition(name));
        return response.download(link);
    }

    // obtener files de los objects
    object_type = async ({ params, request }) => {
        let { object_type } = request.all();
        if (!this.allow.includes(object_type)) throw new CustomException("El tipo de objecto no está permitido", "ERR_ALLOW_OBJECT_TYPE", 501);
        let { page } = request.all();
        let Object = use(object_type);
        let obj = await Object.find(params.object_id);
        if (!obj) throw new NotFoundModelException("El objeto");
        // obtener archivos
        let files = await File.query()
            .where('object_type', object_type)
            .where('object_id', obj.id)
            .paginate(page || 1, 20);
        // response
        return {
            status: 201,
            success: true,
            object: obj,
            files
        }
    };

    // actualizar
    update = async ({ params, request }) => {
        // obtener archivo
        let file = await File.find(params.id);
        if (!file) throw new NotFoundModelException("El archivo");
        // guardae archivo
        let current_file = await Storage.saveFile(request, "file", {
            multifiles: false,
            required: true,
            size: Env.get('DRIVE_SIZE', '6mb')
        }, Helpers, {
            path: `${file.object_type.split('/').pop()}/${uid(10)}`.toLowerCase(),
            options: {
                overwrite: true
            }
        })
        // validar guardado
        if (current_file.success) if (await Drive.exists(file.real_path)) await Drive.delete(file.real_path);
        // actualizar file
        file.url = LINK("tmp", current_file.path),
        file.real_path = current_file.realPath;
        file.size = current_file.size;
        file.tag = request.input('tag');
        await file.save();
        // response
        return {
            success: true,
            status: 201,
            message: "El archivo se actualizó correctamente!",
            file
        };
    }

    // actualizar observación
    observation = async ({ params, request }) => {
        // obtener archivo
        let file = await File.find(params.id);
        if (!file) throw new NotFoundModelException("El archivo");
        // actualizar observación
        file.observation = request.input('observation', '');
        await file.save();
        // response
        return { 
            success: true,
            status: 201,
            message: `El observación se guardo correctamente!`,
            file
        }
    }

    // eliminar archivo
    destroy = async ({ params, request }) => {
        // obtener archivo
        let file = await File.find(params.id);
        if (!file) throw new NotFoundModelException("El archivo");
        let exists = await Drive.exists(file.real_path);
        if (exists) await Drive.delete(file.real_path); 
        await file.delete();
        // response
        return {
            success: true, 
            status: 201,
            message: "EL archivo se eliminó correctamente!"
        }
    }
}

module.exports = FileController
