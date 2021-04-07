'use strict'

const moment = require("moment");

const Tracking = exports = module.exports = {}

Tracking.verify = async (request, tramite, tracking) => {
    let auth = request.$auth;
    let socket = request.$io();
    // emitir socket
    socket.emit('Tramite/TramiteListener.verify', tracking);
    // enviar email
    await request.api_authentication.post('mail/to', {
        from: request._system.email,
        email: auth.email,
        header: `Trámite Verificado`,
        username: `Código: ${tramite.slug}`,
        contenido: `
            Usted acaba de dar la autorización del trámite <br/>
            <b>Asunto:</b> ${tramite.asunto}
        `,
        subject: 'Trámite listo para ser derivado'
    }).catch(err => console.log(err.message));
}


Tracking.notification = async (request, tramite, tracking) => {
    let auth = request.$auth;
    let system = request._system;
    // obtener dependencia
    let dep = await request.api_authentication.get(`dependencia/${tracking.dependencia_destino_id} || '__error`)
        .then(res => res.data)
        .catch(err => ({
            success: false,
            dependencia: {}
        }));
    // validar dependencia
    if (dep.success) {
        // object obstrucción
        let { dependencia } = dep;
        // obtener person
        let person = await request.api_authentication.get(`find_person/${tramite.person_id || '_error'}`)
            .then(res =>  res.data)
            .catch(err => ({ error: true }));
        // validar envio de email a la persona
        if (!person.error) {
            // enviar email
            await request.api_authentication.post('mail/to', {
                from: system.email,
                email: person.email_contact,
                header: tracking.status,
                username: `Código: ${tramite.slug}`,
                contenido: `
                    Dependencia destino: <b>${dependencia.nombre}</b> <br/>
                    Asunto: <b>${tramite.asunto}</b>
                `,
                subject: 'Seguimiento de trámite'
            });
        }
        // enviar email al usuario actual
        await request.api_authentication.post('mail/to', {
            from: system.email,
            email: auth.email,
            header: tracking.status,
            username: `Código: ${tramite.slug}`,
            contenido: `
                Dependencia destino: <b>${dependencia.nombre}</b> <br/>
                Asunto: <b>${tramite.asunto}</b>
            `,
            subject: 'Mi Seguimiento'
        });
    }
}
