'use strict';

const DB = use('Database');
const Drive = use('Drive');
const Tramite = use('App/Models/Tramite');
const Tracking = use('App/Models/Tracking');
const TramiteType = use('App/Models/TramiteType');
const Role = use('App/Models/Role');
const NotFoundModelException = require('../Exceptions/NotFoundModelException');
const CustomException = require('../Exceptions/CustomException');
const { validation, ValidatorError } = require('validator-error-adonis');
const uid = require('uid');
const DBException = require('../Exceptions/DBException');
const FileEntity = require('../Entities/FileEntity');
const { collect } = require('collect.js');
const { PDFDocument } = require('pdf-lib');

class TramiteEntity {

    constructor (authentication = {}) {
        if (authentication) this.authentication = authentication;
    }
    
    attributes = {
        entity_id: "",
        person_id: "",
        slug: "",
        document_number: "",
        tramite_type_id: "",
        folio_count: 0,
        asunto: "",
        observation: "",
        dependencia_origen_id: "",
        tramite_parent_id: "",
        user_id: "",
        state: 1
    }

    async store (request, datos = this.attributes, auth = {}, next = null) {
        // validaciones
        await validation(null, datos, {
            slug: "required|max:10|min:10",
            entity_id: "required",
            dependencia_id: "required",
            person_id: "required",
            tramite_type_id: 'required|max:11',
            document_number: 'required|min:4|max:255',
            asunto: 'required|min:4'
        });
        // validar dependencias
        const isAuth = Object.keys(auth || {}).length;
        const self_remitente = isAuth ? auth.person_id == datos.person_id : false;
        // generar slug
        let slug = `${datos.slug}`.toUpperCase();
        // validar slug
        const existSlug = await Tramite.findBy('slug', slug);
        if (existSlug) throw new Error("El código autogenerado ya existe!!!");
        // obtener persona
        let { person, success } = await this.authentication.get(`person/${datos.person_id || '_error'}`)
        .then(res => res.data)
        .catch(err => ({ success: false }));
        if (!success) throw new ValidatorError([{ field: 'person_id', message: `La persona no existe!` }]);
        // obtener tramite documento
        let type = await TramiteType.find(datos.tramite_type_id);
        if (!type) throw new ValidatorError([{ field: 'tramite_type_id', message: 'EL tipo de documento es incorrecto' }]);
        // preparar datos
        let payload = {
            entity_id: datos.entity_id,
            person_id: person.id,
            slug: slug,
            document_number: datos.document_number,
            tramite_type_id: datos.tramite_type_id,
            folio_count: 0,
            observation: datos.observation,
            asunto: datos.asunto,
            dependencia_origen_id: isAuth ? datos.dependencia_id : null,
            tramite_parent_id: null,
            user_id: isAuth ? auth.id : null,
        } 
        // verificar role
        let boss = await Role.query()
            .where('entity_id', datos.entity_id)
            .where('dependencia_id', datos.dependencia_id)
            .where('level', 'BOSS')
            .where('state', 1)
            .first();
        if (!boss) throw new NotFoundModelException("Al jefe");
        // validar tramite parent
        if (datos.tramite_id) {
            let tramite_parent = await Tramite.find(request.input('tramite_id'));
            if (!tramite_parent) throw new NotFoundModelException("El trámite raíz");
            payload.tramite_parent_id = tramite_parent.id;
            payload.slug = tramite_parent.slug;
        }
        // transacciones
        let trx = await DB.beginTransaction();
        // procesar trámite
        try {
            // guardar tramite
            let tramite = await Tramite.create(payload, trx);
            // preparar tracking
            let payload_tracking = {
                tramite_id: tramite.id,
                dependencia_id: datos.dependencia_id,
                person_id: tramite.person_id,
                user_id: isAuth ? auth.id : null,
                user_verify_id: isAuth ? auth.id : null,
                current: 1,
                alert: 0,
                revisado: isAuth ? 0 : 1,
                status: isAuth ? 'REGISTRADO' : 'RECIBIDO',
                modo: self_remitente ? 'YO' : 'DEPENDENCIA',
                first: 1,
                tracking_id: null,
                next: tramite.tramite_parent_id ? next : null,
                readed_at: null
            };
            // validar next tracking
            let allow = ['RESPONDIDO'];
            if (next && !allow.includes(next))  throw new CustomException(`la siguiente acción "${next}" no está permitida!`);
            // obtener boss
            if (!self_remitente) {
                // actualizar user_verify_id
                payload_tracking.user_verify_id = boss.user_id;
            }
            // obtener tracking
            if (tramite.tramite_parent_id) {
                let before_tracking = await Tracking.query()
                    .where("tramite_id", tramite.tramite_parent_id)
                    .where("current", 1)
                    .first(); 
                if (!before_tracking) throw new CustomException(`No se encontró un seguimiento activo del trámite raíz!`);
                payload_tracking.tracking_id = before_tracking.id;
                // finalizar tracking
                let allow_over = ['RESPONDIDO'];
                if (allow_over.includes(next)) {
                    before_tracking.merge({ current: 0, status: 'FINALIZADO' });
                    await before_tracking.save();
                }
            }
            // crear tracking
            let tracking = await Tracking.create(payload_tracking, trx);
            // guardar archivos
            const fileEntity = new FileEntity();
            let files = await fileEntity.store(request, { 
                object_id: tramite.id, 
                object_type: 'App/Models/Tramite',
                extnames: ['pdf', 'docx', 'doc', 'DOCX', 'DOC', 'PDF']
            }, `/tramite/${slug}`, trx);
            // guardar transacción
            trx.commit();
            // obtener folio
            let folio_count = await this.generateFolio(tramite, files);
            if (folio_count) {
                tramite.merge({ folio_count: folio_count });
                await tramite.save();
            }
            // add 
            tramite.tracking = tracking;
            tramite.person = person;
            tramite.files = files;
            // response
            return JSON.parse(JSON.stringify(tramite));
        } catch (error) {
            trx.rollback();
            throw new DBException(error, "regístro");
        }
    }

    async generateFolio (tramite, files = []) {
        let folio_count = 0;
        let only_pdf = collect(files).where('extname', 'pdf').toArray();
        for (let file of only_pdf) {
            try {
                let exists = await Drive.exists(file.real_path);
                if (!exists) continue;
                let current_pdf = await Drive.get(file.real_path);
                let docPdf = await PDFDocument.load(current_pdf);  
                folio_count += docPdf.getPageCount(); 
            } catch (error) { }
        }
        // response
        return folio_count;
    }

}

module.exports = TramiteEntity;