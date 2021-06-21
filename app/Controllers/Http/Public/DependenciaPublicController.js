'use strict'

const DependenciaExterior = use('App/Models/DependenciaExterior');

class DependenciaPublicController {

    /**
     * mostrar dependencias permitidas al exterior
     * @param {*} param0 
     */
    show = async ({ params, request }) => {
        let { page, code } = request.all();
        let exterior = await DependenciaExterior.query()
            .where('entity_id', params.entityId)
            .where('code', code || null)
            .pluck('dependencia_id');
        let ids = exterior.join('&ids[]=');
        // get dependencias
        let dependencia = await request.api_authentication.get(`dependencia?page=${page || 1}&ids[]=${ids}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                status: err.status || 501,
                dependencia: {
                    total: 0,
                    page: 1,
                    lastPage: 1,
                    data: []
                }
            }));
        // response
        return dependencia
    }

}

module.exports = DependenciaPublicController
