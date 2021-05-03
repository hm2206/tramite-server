'use strict'

const { validation, ValidatorError } = require('validator-error-adonis');
const { validateAll } = use('Validator');
const TramiteType = use('App/Models/TramiteType');
const Tramite = use('App/Models/Tramite');
const uid = require('uid')
const Event = use('Event');
const codeQR = require('qrcode');
const Env = use('Env');
const File = use('App/Models/File');
const Drive = use('Drive');
const TramiteEntity = require('../../Entities/TramiteEntity');

class TramiteController {

    // crear tramite interno
    store = async ({ request }) => {
        const authentication = request.api_authentication;
        const auth = request.$auth;
        const entity = request.$entity;
        const dependencia = request.$dependencia;
        const tramiteEntity = new TramiteEntity(authentication);
        const datos = request.all();
        datos.entity_id = entity.id;
        datos.dependencia_id = dependencia.id;
        let next = request.input('next');
        let tramite = await tramiteEntity.store(request, datos, auth, next);
        // notificar por email
        Event.fire('tramite::new', request, tramite, tramite.person, auth.person, dependencia);
        // notificar por socket
        let socket = request.$io();
        socket.emit('Tramite/TramiteListener.store', { tramite, tracking: tramite.tracking });
        // enviar notification
        authentication.post(`auth/notification`, {
            receive_id: tramite.tracking.user_verify_id,
            title: `Nuevo trámite: ${tramite.slug}`,
            description: `Se acabá de agregar un trámite a tu bandeja de entrada`,
            method: request.$method,
        }).catch(err => console.log(err.response));
        // response
        return {
            success: true,
            status: 201,
            message: "El tramite se creó correctamente",
            tramite
        }
    }

    // generar código QR
    codeQr = async ({ params, response }) => {
        try {
            let tramite = await Tramite.findBy('slug', params.slug);
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
}

module.exports = TramiteController
