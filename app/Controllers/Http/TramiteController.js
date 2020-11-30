'use strict'

const { validation, ValidatorError, Storage } = require('validator-error-adonis');
const { validateAll } = use('Validator');
const TramiteType = use('App/Models/TramiteType');
const Tramite = use('App/Models/Tramite');
const uid = require('uid')
const Helpers = use('Helpers')
const { LINK, URL } = require('../../../utils')
const Event = use('Event');
const codeQR = require('qrcode');
const Env = use('Env');
const Role = use('App/Models/Role');

class TramiteController {

    store = async ({ request }) => {
        await validation(validateAll, request.all(), {
            tramite_type_id: 'required|max:11',
            document_number: 'required|min:4|max:255',
            folio_count: 'required|min:1|max:10',
            asunto: 'required|min:4'
        });
        // verify
        let verify = request.input('verify');
        // obtener tramite documento
        let type = await TramiteType.find(request.input('tramite_type_id'));
        if (!type) throw new ValidatorError([{ field: 'tramite_type_id', message: 'EL tipo de tramite es incorrecto' }]);
        // generar slug
        let slug = `${type.short_name}${uid(10)}`.toUpperCase().substr(0, 10);
        // obtener al auth y dependencia
        let auth = request.$auth;
        let dependencia = request._dependencia;
        // payload
        let payload = {
            user_id: auth.id,
            entity_id: request._entity.id,
            dependencia_id: dependencia.id,
            person_id: auth.person_id,
            slug,
            document_number: request.input('document_number'),
            tramite_type_id: request.input('tramite_type_id'),
            folio_count: request.input('folio_count'),
            asunto: request.input('asunto'),
            dependencia_origen_id: request._dependencia.id,
            verify: 1
        }
        // validar verificación
        if (verify === "1") {
            let my_role = await Role.query()
                .where('user_id', auth.id)
                .where('dependencia_id', dependencia.id)
                .first();
            // verificar rol
            if (!my_role) throw new Error("Usted no cuenta con un rol para realizar la acción");
            // verificar level
            switch (my_role.level) {
                case 'SECRETARY':
                    // obtener al boss
                    let role_boss = await Role.query()
                        .where('dependencia_id', dependencia.id)
                        .where('level', 'BOSS')
                        .first();     
                    if (!role_boss) throw new Error("Aún no tiene un jefe asignado!");
                    // obtener datos del usuario
                    let { success, person, message } = await request.api_authentication.get(`user/${role_boss.user_id}/person`)
                        .then(res => res.data)
                        .catch(err => ({ success: false, message: err.message }));
                    // validar persona
                    if (!success) throw new Error(message);
                    // agregar al payload
                    payload.person_id = person.id
                    payload.verify = 0;
                    break;
                default:
                    break;
            }
        }
        // guardar file
        let file = await Storage.saveFile(request, 'files', {
            multifiles: true,
            required: true,
            size: '5mb',
            extnames: ['pdf']
        }, Helpers, {
            path: `/tramite/${slug}`,
            options: {
                overwrite: true 
            }
        });
        // add files
        let tmpFile = [];
        // validar files y agregar file
        if (file.success) await file.files.map(async f => await tmpFile.push(LINK("tmp", f.path)));
        // add file 
        payload.files = JSON.stringify(tmpFile || []);
        // guardar tramite
        let tramite = await Tramite.create(payload);
        // obtener url
        await tramite.getUrlFile();
        // send event
        Event.fire('tramite::new', request, tramite, auth.person, auth.person, request._dependencia);
        // response
        return {
            success: true,
            status: 201,
            code: 'RES_SUCCESS',
            message: 'El tramite se creó correctamente',
            tramite
        }
    }

    // generar código QR
    codeQr = async ({ params, response }) => {
        try {
            let tramite = await Tramite.find(params.id);
            if (!tramite) throw new Error("No se encontró el tramite");
            let link = `${Env.get('CLIENT_TRAMITE')}?slug=${tramite.slug}`;
            let code = await codeQR.toBuffer(link);
            response.header('Content-Type', 'image/png')
            return response.send(code);
        } catch (error) {
            response.status(error.status || 501);
            return response.send({
                success: false,
                status: error.status || 501,
                message: error.message
            })
        }
    }

    // eliminar archivo
    deleteFile = async ({ params, request }) => {
        let tramite = await Tramite.query().where("verify", 0).where("id", params.id).first();
        let index = request.input('index');
        let files = JSON.parse(tramite.files) || [];
        if (files.length > 1) {
            let name = files[index];
            files.splice(index, 1);
            console.log(files);
            tramite.files = JSON.stringify(files);
            await tramite.save();
            // response
            return {
                success: true,
                status: 201,
                message: "El archivo se eliminó correctamente!"
            };
        }
        // error de archivo
        throw new Error("no se pudo eliminar el archivo");
    }

    // actualizar archivo
    updateFile = async ({ params, request }) => {
        let tramite = await Tramite.query().where("verify", 0).where("id", params.id).first();
        if (!tramite) throw new Error("No se encontró el trámite!"); 
        let index = request.input('index');
        let files = JSON.parse(tramite.files) || [];
        // obtener metadatos
        let current_file = files[index];
        // nuevo archivo
        let newFile = await Storage.saveFile(request, "file", {
            required: true,
            extnames: ['pdf']
        }, Helpers, {
            path: `/tramite/${tramite.slug}`,
            options: {
                overwrite: true
            }
        });
        // verificar el guardado del archivo
        if (!newFile.success) throw new Error(newFile.message);
        // actualizar ruta
        current_file = `file?disk=tmp&path=${newFile.path}`;
        files[index] = current_file;
        tramite.files = JSON.stringify(files);
        await tramite.save();
        // response
        return {
            success: true,
            status: 201,
            message: "El archivo se actualizo correctamente!",
            file: URL(current_file, true)
        };
    }

    // actualizar archivo
    attachFile = async ({ params, request }) => {
        let tramite = await Tramite.query().where("verify", 0).where("id", params.id).first();
        if (!tramite) throw new Error("No se encontró el trámite!"); 
        let files = JSON.parse(tramite.files) || [];
        // nuevo archivo
        let newFile = await Storage.saveFile(request, "file", {
            required: true,
            extnames: ['pdf']
        }, Helpers, {
            path: `/tramite/${tramite.slug}`,
            options: {
                overwrite: true
            }
        });
        // verificar el guardado del archivo
        if (!newFile.success) throw new Error(newFile.message);
        // actualizar ruta
        let current_file = `file?disk=tmp&path=${newFile.path}`;
        files.push(current_file);
        tramite.files = JSON.stringify(files);
        await tramite.save();
        // response
        return {
            success: true,
            status: 201,
            message: "El archivo se actualizo correctamente!",
            file: URL(current_file)
        };
    }
}

module.exports = TramiteController
