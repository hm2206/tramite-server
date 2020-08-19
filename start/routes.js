'use strict'

const Route = use('Route')

// customizar group
const addGroup = (group) => {
  group.prefix('api');
  return group;
}


// ruta v1
addGroup(Route.group(() => {

  // Ruta de Tramite
  Route.post('/tramite', 'TramiteController.store').middleware(['allow:TramiteController.store', 'jwt', 'entityId', 'dependenciaId']);

  // Ruta de Traking del documento
  Route.post('/tracking/:id/next', 'TrackingController.next').middleware(['allow:TrackingController.next', 'jwt', 'entityId', 'dependenciaId']);

  // Ruta Publica de Tramite
  Route.post('/public/tramite', 'public/TramitePublicController.store').middleware(['allow:public/TramitePublicController.store']);
  Route.get('/public/tramite/:slug', 'public/TramitePublicController.show').middleware(['allow:public/TramitePublicController.show']);
  Route.get('/public/tramite/:slug/tracking', 'public/TramitePublicController.tracking').middleware(['allow:public/TramitePublicController.tracking']);

  // Ruta public de Tip. Tramite
  Route.get('/tramite_type', 'TramiteTypeController.index').middleware(['allow:TramiteTypeController.index']);

  // Ruta Publica de Dependencia
  Route.get('/public/dependencia/:entityId', 'public/DependenciaPublicController.show').middleware(['allow:public/DependenciaPublicController.show']);

}));


