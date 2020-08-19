'use strict'

const Tracking = use('App/Models/Tracking');
const { validation, ValidatorError, Storage } = require('validator-error-adonis');
const { validate } = use('Validator');
const uid = require('uid');
const Helpers = use('Helpers');
const { LINK } = require('../../../utils');

class TrackingController {

    /**
     * Derivar, Anular, Aceptar, Rechazar y Finalizar el tramite en el tracking
     * @param {*} param0 
     */
    next = async ({ params, request }) => {
        // variable globales
        let tracking = null;
        let file_tmp = await this._saveFile({ request });
        let file = null;
        let description = null;
        let current = 0;
        let status = `${request.input('status')}`.toUpperCase();
        // status permitidos
        let allow_verification = ['DERIVADO', 'FINALIZADO', 'ANULADO'];
        let allow_validation = ['ACEPTADO', 'RECHAZADO'];
        // generar payload
        let payload = { 
            description: '---',
            file: null,
            user_id: request.$auth.id,
            user_destino_id: request.input('user_destino_id', null),
            tramite_id: "",
            dependencia_origen_id: request._dependencia.id,
            dependencia_destino_id: request.input('dependencia_destino_id'),
            current: 1,
            parent: 0
        }
        // validar status
        if (allow_verification.includes(status)) {
            // validar inputs
            await validation(validate, request.all(), {
                dependencia_destino_id: 'required',
                status: 'required',
                description: 'required|max:255'
            });
            // obtener tracking parent
            tracking = await this._getTracking({ params, request }, 1);
            payload.tramite_id = tracking.tramite_id;
            payload.file = file_tmp;
            // derivar tracking
            if (status == 'DERIVADO') await this._derivar({ request, payload });
            else {
                // add file y description
                file = file_tmp;
                description = request.input('description');
                current = 1;
            }
        } else if ( allow_validation.includes(status)) {
            // validar inputs
            await validation(validate, request.all(), {
                status: 'required',
                description: 'required|max:255'
            });
            // obtener tracking sin parent
            tracking = await this._getTracking({ params, request }, 0);
            payload.tramite_id = tracking.tramite_id;
            payload.dependencia_destino_id = request._dependencia.id;
            payload.parent = 1;
            // aceptar tracking
            if (status == 'ACEPTADO') await this._nextTracking({ payload });
            else {
                // add file y description
                file = file_tmp;
                description = request.input('description');
                current = 1;
            }
        } else throw new Error(`El status no está permitido (${allow_verification.join(", ")}, ${allow_validation.join(", ")})`);
        // actualizar status de tracking actual
        tracking.file = file;
        tracking.current = current;
        tracking.description = description;
        tracking.status = status;
        await tracking.save();
        // response
        return {
            success: true,
            status: 201,
            code: 'RES_TRACKING_NEXT',
            message: `El tramite se a ${status.toLowerCase()} correctamente`
        }
    }

    /**
     * Obtener el tracking del tramite
     * @param {*} param0 
     * @param {*} parent 
     */
    _getTracking = async ({ params, request }, parent = 1) => {
        let tracking = await Tracking.query()
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('tra.entity_id', request._entity.id)
            .where('trackings.dependencia_destino_id', request._dependencia.id)
            .where('trackings.status', 'PENDIENTE')
            .where('trackings.id', params.id)
            .where('trackings.current', 1)
            .where('trackings.parent', parent)
            .select('trackings.*')
            .debug(['enabled'])
            .first();
        // validar tracking
        if (!tracking) throw new Error('No se encontró el tracking del tramite')
        // response tracking
        return tracking;
    }

    /**
     * guardar file
     * @param {*} param0 
     */
    _saveFile = async ({ request }) => {
        // guardar archivo 
        let file = await Storage.saveFile(request, 'file', {
            size: '5mb',
            extnames: ['pdf', 'docx']
        }, Helpers, {
            path: '/tracking/file',
            options: {
                name: `tracking_${uid(8)}`,
                overwrite: true 
            }
        });
        // response path file
        return file.path ? LINK('tmp', file.path) : null;
    }

    /**
     * generar nuevo tracking
     * @param {*} param0 
     */
    _nextTracking = async ({ payload }) => {
        // save tracking
        await Tracking.create(payload);
    }

    /**
     * derivar tracking
     * @param {*} param0 
     */
    _derivar = async ({ request, payload }) => {
        // validar dependencia interna
        if (request.input('dependencia_destino_id') == request._dependencia.id) {
            if (!request.input('user_destino_id')) throw new ValidatorError([{ field: 'user_destino_id', message: 'El destinatario es obligatorio' }]);
            if (request.input('user_destino_id') == request.$auth.id) throw new ValidatorError([{ field: 'user_destino_id', message: 'Usted no puede se el destinatario' }]);
        }
        // save next tracking
        await this._nextTracking({ payload });
    }

}

module.exports = TrackingController
