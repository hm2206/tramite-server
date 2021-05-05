'use strict'

const Tramite = exports = module.exports = {}

Tramite.createTramite = async (request, tramite, person, creado, dependencia) => {
    // enviar correo
    request.api_authentication.post('mail/to', {
        from: request.$system.email,
        email: person.email_contact,
        header: `Trámite ${tramite.dependencia_origen_id ? 'regístrado' : 'enviado'} correctamente`,
        username: `Código: ${tramite.slug}`,
        contenido: `
            Dependencia destino: <b>${dependencia.nombre}</b> <br/>
            Creado por: <b style="text-transform: capitalize;">${creado.fullname}</b>
        `,
        subject: 'Nuevo trámite'
    });
}


Tramite.createNotification = async (request, tramite, tracking) => {
    let authentication = request.api_authentication;
    let method = request.$method;
    authentication.post(`auth/notification`, {
        receive_id: tracking.user_verify_id,
        title: `Nuevo trámite: ${tramite.slug}`,
        description: `Se acabá de agregar un trámite a tu bandeja de entrada`,
        method: request.$method,
        object_type: 'App/Models/Tramite',
        object_id: tramite.id
    }).catch(err => console.log(err.response));
}