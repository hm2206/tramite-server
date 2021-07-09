'use strict';

const Route = require('../app/Services/route');

// Config Dependencia
Route('post', 'ConfigDependenciaController.store').middleware(['jwt', 'entityId']);
Route('get', 'ConfigDependenciaController.dependenciaDestino').middleware(['jwt', 'entityId']);
Route('delete', 'ConfigDependenciaController.delete').middleware(['jwt', 'entityId']);

// Tramite
Route("get", "TramiteController.index").middleware(['jwt', 'entityId']);
Route("get", "TramiteController.show");
Route("get", "TramiteController.codeQr");
Route("post", "TramiteController.store").middleware(['jwt', 'entityId', 'dependenciaId', 'socket']);
Route("post", "TramiteController.anularProcess").middleware('jwt');
Route("put", "TramiteController.update").middleware(['jwt']);
Route("delete", "TramiteController.delete").middleware(['jwt', 'entityId']);
Route("put", "TramiteController.toggleCurrent").middleware(['jwt', 'entityId']);
Route("get", "TramiteController.trackings").middleware(['jwt', 'entityId']);

// Tipo de trámite
Route("get", "TramiteTypeController.index");
Route("post", "TramiteTypeController.store").middleware(['jwt']);
Route("get", "TramiteTypeController.show");
Route("put", "TramiteTypeController.update").middleware(['jwt']);
Route("put", "TramiteTypeController.state").middleware(['jwt']);

// Tracking
Route("get", "TrackingController.show");
Route("get", "TrackingController.multiple");
Route("put", "TrackingController.update").middleware(["jwt"]);
Route("put", "TrackingController.archived").middleware(['jwt', 'entityId', 'dependenciaId', 'socket']);
Route("delete", "TrackingController.backRecibido").middleware(['jwt', 'entityId', 'dependenciaId']);

// Files
Route("get", "FileController.handle", false);
Route("post", "FileController.store").middleware(['jwt', "entityId"]);
Route("get", "FileController.object_type").middleware(['jwt']);
Route("post", "FileController.update").middleware(['jwt']);
Route("post", "FileController.observation").middleware(['jwt']);
Route("post", "FileController.destroy").middleware(['jwt']);

// Roles
Route("get", "RoleController.index").middleware(['jwt', 'entityId']);
Route("post", "RoleController.store").middleware(['jwt', 'entityId',]);
Route("put", "RoleController.disabled").middleware(['jwt', 'entityId']);

// Verificar
Route("post", "VerifyController.handle").middleware(['jwt', 'entityId', 'dependenciaId', 'socket']);

// Next
Route("post", "NextController.handle").middleware(['jwt', 'entityId', 'dependenciaId']);

// Linea de Tiempo
Route("get", "TimelineController.handle");

// Auth
Route("get", "Auth/AuthRoleController.handle").middleware(['jwt', 'entityId', 'dependenciaId']);
Route("get", "Auth/AuthTramiteController.index").middleware(['jwt', 'entityId', 'dependenciaId']);
Route("get", "Auth/AuthTramiteController.show").middleware(['jwt', 'entityId', 'dependenciaId']);
Route("get", "Auth/AuthTrackingController.handle").middleware(['jwt', 'entityId', 'dependenciaId']);
Route("get", "Auth/AuthStatusController.handle").middleware(['jwt', 'entityId', 'dependenciaId']);

// public
Route("post", "Public/TramitePublicController.store");
Route("get", "Public/DependenciaPublicController.show");
