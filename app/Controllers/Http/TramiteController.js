'use strict'

const { validation, ValidatorError, Storage } = require('validator-error-adonis');
const { validate } = use('Validator');
const TramiteType = use('App/Models/TramiteType');
const Tramite = use('App/Models/Tramite');
const uid = require('uid')
const Helpers = use('Helpers')
const { LINK } = require('../../../utils')
const Event = use('Event');
const axios = require('axios').default;
const Drive = use('Drive');
const fs = require('fs');
const FormData = require('form-data');
const concat = require('concat-stream');

class TramiteController {

    store = async ({ request }) => {
        await validation(validate, request.all(), {
            tramite_type_id: 'required|max:11',
            document_number: 'required|min:4|max:255',
            folio_count: 'required|min:1|max:10',
            asunto: 'required|min:4',
            info_signature: 'required',
            person_id: 'required'
        });
        // obtener tramite documento
        let type = await TramiteType.find(request.input('tramite_type_id'));
        let info_signature = request.input('info_signature', []);
        if (!type) throw new ValidatorError([{ field: 'tramite_type_id', message: 'EL tipo de tramite es incorrecto' }]);
        // generar slug
        let slug = `${type.short_name}${uid(10)}`.toUpperCase().substr(0, 10);
        // obtener al auth y dependencia
        let auth = request.$auth;
        let dependencia = request._dependencia;
        // obtener persona
        let person = await request.api_authentication.get(`find_person/${request.input('person_id')}`)
            .then(res => res.data)
            .catch(err => ({
                success: err.message,
                message: err.message,
                person: {}
            }))
        // validar persona
        if (!person.id) throw new ValidatorError([{ field: 'person_id', message: 'No se encontró la persona' }]);
        // payload
        let payload = {
            user_id: auth.id,
            entity_id: request._entity.id,
            dependencia_id: request._dependencia.id,
            person_id: person.id,
            slug,
            document_number: request.input('document_number'),
            tramite_type_id: request.input('tramite_type_id'),
            folio_count: request.input('folio_count'),
            asunto: request.input('asunto'),
            dependencia_origen_id: request._dependencia.id
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
        let indexT = 0;
        // add files
        for (let f of file.files) {
            let newLink = await LINK('tmp', f.path);
            tmpFile.push(newLink);
            // firmar pdf
            let signInfo = JSON.parse(info_signature[indexT]) || {};
            // enviar firma
            if (signInfo.signed) {
                // form data
                let form = new FormData();
                form.append('reason', request.input('asunto'));
                form.append('location', dependencia.nombre || "PE"); 
                form.append('visible', signInfo.visible || 'false'); 
                form.append('page', `${signInfo.page}` || "1");
                form.append('position', `${signInfo.position}` || "0");
                form.append('file', fs.createReadStream(f.realPath));
                console.log(form);
                // config signer
                const firmar = new Promise((resolve, reject) => {
                    form.pipe(concat({ encoding: 'buffer' }, async (data) => {
                        return await request.api_signature.post(`signer/${request.input('person_id')}`, data, {
                            responseType: 'arraybuffer',
                            headers: form.getHeaders()
                        }).then(res => {
                           resolve(res);
                        }).catch(err => {
                            fs.unlinkSync(f.realPath);
                            reject(err);
                         });
                    }));
                });
                // execute signer
                await firmar.then(async res => {
                    await Drive.put(f.realPath, Buffer.from(res.data));
                }).catch(err => {
                    throw new Error("No se pudo firmar el pdf");
                });
            }
            // next file
            indexT++;
        }
        // add file 
        payload.files = JSON.stringify(await tmpFile);
        // guardar tramite
        let tramite = await Tramite.create(payload);
        // obtener url
        await tramite.getUrlFile();
        // send event
        Event.fire('tramite::new', request, tramite, person, auth.person, request._dependencia);
        // response
        return {
            success: true,
            status: 201,
            code: 'RES_SUCCESS',
            message: 'El tramite se creó correctamente',
            tramite
        }
    }

}

module.exports = TramiteController
