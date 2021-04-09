'use strict'

const { validation, ValidatorError } = require('validator-error-adonis');
const TramiteType = use('App/Models/TramiteType');
const Tramite = use('App/Models/Tramite');
const Tracking = use('App/Models/Tracking');
const DependenciaExterior = use('App/Models/DependenciaExterior');
const uid = require('uid');
const { URL } = require('../../../../utils')
const FileController = require('../FileController');
const CustomException = require('../../../Exceptions/CustomException');
const collect = require('collect.js');
const Event = use('Event');
const { PDFDocument } = require('pdf-lib');
const codeQR = require('qrcode');
const File = use('App/Models/File');
const Env = use('Env');
const Drive = use('Drive');


class TramitePublicController {

    /**
     * guardar tramite desde el exterior
     * @param {*} param0 
     */
    store = async ({ request }) => {
        await validation(null, request.all(), {
            entity_id: 'required',
            dependencia_id: 'required',
            person_id: "required",
            tramite_type_id: 'required|max:11',
            document_number: 'required|min:4|max:255',
            folio_count: 'required|min:1|max:10',
            asunto: 'required|min:4',
        });
        // obtener entity
        let { entity } = await request.api_authentication.get(`entity/${request.input('entity_id')}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                message: err.message,
                entity: {}
            }));
        // validar entity
        if (!entity.id) throw new ValidatorError([{ field: 'entity_id', message: 'No se encontró la entidad' }]);
        // obtener dependencia
        let dependencia = await request.api_authentication.get(`dependencia/${request.input('dependencia_id')}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                message: err.message,
                dependencia: {}
            }));
        // validar dependencia
        if (!dependencia.success) throw new ValidatorError([{ field: 'dependencia_id', message: dependencia.message }]);
        if (!await DependenciaExterior.query().whereRaw(`entity_id = ${request.input('entity_id')} AND dependencia_id = ${request.input('dependencia_id')}`).getCount()) 
            throw new ValidatorError([{ field: 'dependencia_id', message: 'La dependencia no está permitida' }]);
        // obtener persona
        let person = await request.api_authentication.get(`find_person/${request.input('person_id')}`)
            .then(res => res.data)
            .catch(err => ({
                success: err.message,
                message: err.message,
                person: {}
            }))
        // validar persona
        if (!person.id) throw new ValidatorError([{ field: 'person_id', message: 'No se encontró la persona' }])
        // obtener tramite documento
        let type = await TramiteType.find(request.input('tramite_type_id'));
        if (!type) throw new ValidatorError([{ field: 'tramite_type_id', message: 'EL tipo de tramite es incorrecto' }]);
        // generar slug
        let slug = `${type.short_name}${uid(10)}`.toUpperCase().substr(0, 10);
        // payload
        let payload = {
            entity_id: entity.id,
            person_id: request.input('person_id'),
            slug,
            document_number: request.input('document_number'),
            tramite_type_id: request.input('tramite_type_id'),
            folio_count: 0,
            observation: request.input('observation'),
            asunto: request.input('asunto'),
            dependencia_origen_id: request.input('dependencia_id'),
            tramite_parent_id: null,
            user_id: null,
        }
        // guardar tramite
        let tramite = await Tramite.create(payload);
        // guardar archivos
        try {
            // preparar datos
            let files = new FileController;
            request.object_type = 'App/Models/Tramite';
            request.object_id = tramite.id;
            let upload = await files.store({ request });
            // obtener folio
            let [file] = upload.files;
            let current_file = await File.find(file.id);
            let embedPdf = await Drive.get(current_file.real_path);
            let pdfDoc = await PDFDocument.load(embedPdf);
            // actualizar folio
            tramite.merge({ folio_count: pdfDoc.getPageCount() });
            await tramite.save();
            // send event
            await Event.fire('tramite::tracking', request, tramite, true);
            Event.fire('tramite::new', request, tramite, person, person, dependencia); 
            // response
            return {
                success: true,
                status: 201,
                code: 'RES_SUCCESS',
                message: 'El tramite se creó correctamente',
                tramite
            }
        } catch (error) {
            // eliminar tramite
            await tramite.delete();
            // ejecutar error
            throw new CustomException(error.message, error.name, error.status || 501);
        }
    }

    /**
     * mostrar tramite por slug
     * @param {*} param0 
     */
    show = async ({ params, request }) => {
        let tramite = await Tramite.query()
            .with('tramite_type')
            .where('slug', params.slug)
            .first();
        if (!tramite) throw new Error('No se encontró el tramite');
        // obtener entity
        let entity = await request.api_authentication.get(`entity/${tramite.entity_id}`)
            .then(res => res.data)
            .catch(err => ({}));
        // add entity
        tramite.entity = entity;
        // obtener dependencia
        let { dependencia } = await request.api_authentication.get(`dependencia/${tramite.dependencia_id}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                message: err.message,
                dependencia: {}
            }));
        // add dependencia
        tramite.dependencia = dependencia || { nombre: 'Exterior' };
        // obtener dependencia origen
        let origen = await request.api_authentication.get(`dependencia/${tramite.dependencia_origen_id}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                message: err.message,
                dependencia: {}
            }));
        // add dependencia
        tramite.dependencia_origen = origen.dependencia || {};
        // obtener persona
        let person = await request.api_authentication.get(`find_person/${tramite.person_id}`)
            .then(res => res.data)
            .catch(err => ({}));
        // add persona 
        tramite.person = person || {};
        // generar url file
        await tramite.getUrlFiles();
        // generar code qr
        let link = `${Env.get('CLIENT_TRAMITE')}?slug=${tramite.slug}`;
        let code = await codeQR.toDataURL(link);
        tramite.code_qr = code;
        // response
        return { 
            success: true,
            status: 201,
            code: 'RES_TRAMITE',
            tramite
        }
    }

    /**
     * mostrar el historial del tramite
     * @param {*} param0 
     */
    tracking = async ({ params, request }) => {
        let { page } = request;
        // get tracking
        let tracking = await Tracking.query()
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('tra.slug', params.slug)
            .whereIn('trackings.status', ['ACEPTADO', 'DERIVADO', 'RESPONDIDO', 'RECHAZADO', 'FINALIZADO','ANULADO'])
            .select('trackings.*')
            .paginate(page || 1, 20);
        // parse json 
        tracking = await tracking.toJSON();
        // obtener dependencia destino
        let idDestinos = await collect(tracking.data).pluck('dependencia_destino_id').all().join('&ids[]='); 
        let destino = await request.api_authentication.get(`dependencia?ids[]=${idDestinos}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                status: err.status || 501,
                dependencia: { }
            }));
        // collect dependencia
        destino = collect(destino.dependencia.data || []);
        // obtener users person
        let userIds = collect(tracking.data).pluck('user_id').all().join('&ids[]=');
        let user = await request.api_authentication.get(`user?ids[]=${userIds}`) 
            .then(res => res.data)
            .catch(err => ({ data: [] }));
        // collect user
        user = collect(user.data || []);
        // add dependencia destino y user
        tracking.data.map(async tra => {
            tra.dependencia_destino = destino.where('id', tra.dependencia_destino_id).first() || {};
            tra.user = user.where('id', tra.user_id).first() || {};
            tra.files = await JSON.parse(tra.files) || [];
            let newFiles = [];
            await tra.files.filter(f => newFiles.push(URL(f)));
            tra.files = newFiles;
            return tra;
        });
        // response
        return { 
            success: true,
            status: 201,
            code: 'RES_TRACKING',
            tracking
        }
    }

}

module.exports = TramitePublicController
