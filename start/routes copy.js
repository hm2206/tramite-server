'use strict'

const Route = use('Route');
// customizar group
const addGroup = (group) => {
  group.prefix('api');
  return group;
}

// visualizar archivo
Route.get('file', 'FileController.handle');

// ruta v1
addGroup(Route.group(() => {

  // auth
  Route.get('/auth/role', 'Auth/AuthRoleController.handle').middleware(['allow:Auth/AuthRoleController.handle', 'jwt', 'entityId', 'dependenciaId']);

  // status del tramite
  Route.get('/status/tramite_interno', 'StatusController.tramiteInterno').middleware(['allow:StatusController.tramiteInterno', 'jwt', 'entityId', 'dependenciaId']);
  Route.get('/status/bandeja', 'StatusController.bandeja').middleware(['allow:StatusController.bandeja', 'jwt', 'entityId', 'dependenciaId']);

  // Ruta de Tramite
  Route.post('/tramite', 'TramiteController.store').middleware(['allow:TramiteController.store', 'jwt', 'entityId', 'dependenciaId']);
  Route.get('/tramite/:id/code_qr', 'TramiteController.codeQr').middleware(['allow:TramiteController.codeQr', 'jwt']);
  Route.post('/tramite/:id/delete_file', 'TramiteController.deleteFile').middleware(['allow:TramiteController.deleteFile', 'jwt', 'entityId', 'dependenciaId']);
  Route.post('/tramite/:id/update_file', 'TramiteController.updateFile').middleware(['allow:TramiteController.updateFile', 'jwt', 'entityId', 'dependenciaId']);
  Route.post('/tramite/:id/attach_file', 'TramiteController.attachFile').middleware(['allow:TramiteController.attachFile', 'jwt', 'entityId', 'dependenciaId']);

  // Ruta de Traking del documento
  Route.get('/tracking', 'TrackingController.index').middleware(['allow:TrackingController.index', 'jwt', 'entityId', 'dependenciaId']);
  Route.post('/tracking/:id/next', 'TrackingController.next').middleware(['allow:TrackingController.next', 'jwt', 'entityId', 'dependenciaId']);
  Route.post('/tracking/:id/enable', 'NextController.handle').middleware(['allow:NextController.handle', 'jwt', 'entityId', 'dependenciaId']);

  // Ruta de la bandeja de entrada
  Route.get('/my_tray', 'TrackingController.my_tray').middleware(['allow:TrackingController.my_tray', 'jwt', 'entityId', 'dependenciaId']);

  // Ruta Publica de Tramite
  Route.post('/public/tramite', 'public/TramitePublicController.store').middleware(['allow:public/TramitePublicController.store']);
  Route.get('/public/tramite/:slug', 'public/TramitePublicController.show').middleware(['allow:public/TramitePublicController.show']);
  Route.get('/public/tramite/:slug/tracking', 'public/TramitePublicController.tracking').middleware(['allow:public/TramitePublicController.tracking']);

  // Ruta public de Tip. Tramite
  Route.get('/tramite_type', 'TramiteTypeController.index').middleware(['allow:TramiteTypeController.index']);
  Route.post('/tramite_type', 'TramiteTypeController.store').middleware(['allow:TramiteTypeController.store', 'jwt']);
  Route.get('/tramite_type/:id', 'TramiteTypeController.show').middleware(['allow:TramiteTypeController.show', 'jwt']);
  Route.post('/tramite_type/:id/update', 'TramiteTypeController.update').middleware(['allow:TramiteTypeController.update', 'jwt']);
  Route.post('/tramite_type/:id/state', 'TramiteTypeController.state').middleware(['allow:TramiteTypeController.state', 'jwt']);

  // Ruta Publica de Dependencia
  Route.get('/public/dependencia/:entityId', 'public/DependenciaPublicController.show').middleware(['allow:public/DependenciaPublicController.show']);

  // Ruta para generar code de verificación
  Route.post('/code_verify', 'CodeVerifyController.store').middleware(['allow:CodeVerifyController.store']);


  // Ruta para obtener las configuraciones
  Route.get('/config', 'ConfigController.index').middleware(['allow:ConfigController.index', 'jwt']);
  Route.get('/config/:key', 'ConfigController.show').middleware(['allow:ConfigController.show', 'jwt']);


  // Ruta de reportes
  Route.get('/report/ticket', 'Report/TicketController.handle');
  Route.get('/report/tracking/:id', 'Report/ReportTrackingController.handle');

  // Ruta para validar tramite
  Route.post('/tramite/:id/verify', 'VerifyController.handle').middleware(['allow:VerifyController.handle', 'jwt']);

}));


Route.get('signer', 'SignerController.handle');