'use strict'

const Tramite = exports = module.exports = {}

Tramite.createTramite = async (request, tramite, email, dependencia) => {
    let response = await request.api_authentication.post('mail/to', {
        from: request._system.email,
        email,
        header: "Trámite regístrado correctamente",
        username: `Código: ${tramite.slug}`,
        contenido: `Dependencia destino: <b>${dependencia.nombre}</b>`,
        subject: 'Nuevo trámite'
    });
}
